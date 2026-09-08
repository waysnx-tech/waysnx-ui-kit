// Named + aliased imports from ui-core; PrimaryButton used twice, Input imported but unused.
import { Button as PrimaryButton, Input } from "@waysnx/ui-core";
// Namespace import from ui-feedback; UI.Modal used once.
import * as UI from "@waysnx/ui-feedback";
// Referenced-but-not-installed: ui-navigation is imported but NOT in package.json.
import { Menu } from "@waysnx/ui-navigation";

export function Page() {
  return (
    <div>
      <PrimaryButton>One</PrimaryButton>
      <PrimaryButton>Two</PrimaryButton>
      <UI.Modal open>Hi</UI.Modal>
      <Menu />
      <button type="button">native</button>
    </div>
  );
}

// Input is imported above but never rendered in JSX.
export const unusedRef = Input;
