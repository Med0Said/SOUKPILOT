import type { FieldErrors } from "@/lib/validation/schemas";

/** Result shape shared by all form server actions (used with useActionState). */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Echo of submitted non-secret values so forms keep user input after an error. */
  values?: Record<string, string>;
};

export const initialActionState: ActionState = { status: "idle" };
