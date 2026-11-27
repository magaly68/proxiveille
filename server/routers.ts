import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "./_core/trpc";
import {
  sendBulkEmergencySms,
  verifyTwilioConfig,
} from "./sms-service";

/**
 * Les endpoints d'envoi de SMS ne sont pas authentifies : exposes tels quels,
 * n'importe qui pourrait envoyer des SMS (factures) via le compte Twilio.
 * Ils sont donc desactives tant que ENABLE_SMS_ENDPOINTS !== "true".
 * A reactiver uniquement apres avoir ajoute une authentification par appareil
 * et une limite de debit.
 */
const smsProcedure = publicProcedure.use(({ next }) => {
  if (process.env.ENABLE_SMS_ENDPOINTS !== "true") {
    throw new TRPCError({ code: "FORBIDDEN", message: "SMS endpoints disabled" });
  }
  return next();
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // SMS & Emergency Alerts
  emergency: router({
    // Check if Twilio is configured
    checkSmsConfig: publicProcedure.query(async () => {
      return verifyTwilioConfig();
    }),

    // Send emergency SMS to all contacts
    sendEmergencySms: smsProcedure
      .input(
        z.object({
          recipients: z.array(
            z.object({
              name: z.string(),
              phone: z.string(),
            })
          ),
          patientName: z.string(),
          seizureInfo: z.object({
            timestamp: z.number(),
            intensity: z.enum(["low", "medium", "high"]),
            duration: z.number().optional(),
            detectionSource: z.string().optional(),
          }),
          location: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        console.log(
          `[Emergency] Sending SMS to ${input.recipients.length} contacts for patient ${input.patientName}`
        );
        const result = await sendBulkEmergencySms(input);
        return result;
      }),

    // Send a single test SMS to verify configuration
    sendTestSms: smsProcedure
      .input(
        z.object({
          to: z.string(),
          patientName: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        console.log(`[Emergency] Sending test SMS to ${input.to}`);
        const result = await sendBulkEmergencySms({
          recipients: [{ name: "Test", phone: input.to }],
          patientName: input.patientName || "Test EpiGuard",
          seizureInfo: {
            timestamp: Date.now(),
            intensity: "medium",
            duration: 15,
            detectionSource: "phone",
          },
        });
        return {
          success: result.totalSent > 0,
          error:
            result.totalFailed > 0
              ? result.results[0]?.error
              : undefined,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
