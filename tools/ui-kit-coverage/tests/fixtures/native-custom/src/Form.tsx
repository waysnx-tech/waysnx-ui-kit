import { Button } from "@waysnx/ui-core";
// Type-only import from a @waysnx package — NON-runtime; must not count as usage.
import type { ButtonProps } from "@waysnx/ui-core";
// Subpath import from a @waysnx package — attributes to base @waysnx/ui-diagnostics.
import { DiagnosticsProvider } from "@waysnx/ui-diagnostics/react";
// External component from a bare package — must NOT be labeled custom.
import { Link } from "react-router-dom";
// Project-defined component via a relative import — IS custom.
import { LegacyModal } from "./LegacyModal.js";

export function Form(_props: ButtonProps) {
  return (
    <form>
      <input placeholder="name" />
      <input placeholder="email" />
      <select>
        <option>a</option>
      </select>
      <textarea />
      <button type="submit">Save</button>

      <Button>Kit</Button>
      <DiagnosticsProvider />
      <Link to="/home">Home</Link>
      <LegacyModal />
      <LegacyModal />
    </form>
  );
}
