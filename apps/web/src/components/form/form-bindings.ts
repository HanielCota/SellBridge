import type { FormEvent } from "react";

/** The subset of a TanStack Form string field that the form inputs need. */
export interface StringFieldApi {
  readonly state: {
    readonly value: string;
    readonly meta: { readonly errors: readonly unknown[] };
  };
  readonly handleBlur: () => void;
  readonly handleChange: (value: string) => void;
}

/** Maps a TanStack Form string field to the controlled props of `TextField`/`TextareaField`. */
export function fieldBindings(field: StringFieldApi) {
  return {
    value: field.state.value,
    errors: field.state.meta.errors,
    onBlur: field.handleBlur,
    onValueChange: field.handleChange,
  };
}

/** Builds a `<form onSubmit>` handler that skips native submission and runs `submit`. */
export function submitHandler(submit: () => Promise<unknown>) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };
}
