import type { Instrumentation } from "next";
import { reportOperationalError } from "./lib/operational-errors";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await reportOperationalError(error, request, context);
};

export function register() {}
