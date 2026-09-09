import { Button as SaveButton } from "@waysnx/ui-core";
import type { ButtonProps } from "@waysnx/ui-core";
import { Link } from "react-router-dom";
import { LegacyDatePicker } from "../components/LegacyDatePicker.js";

export function Settings(_props: ButtonProps) {
  return (
    <form>
      <input placeholder="name" />
      <textarea />
      <LegacyDatePicker />
      <Link to="/home">Home</Link>
      <SaveButton>Save</SaveButton>
    </form>
  );
}
