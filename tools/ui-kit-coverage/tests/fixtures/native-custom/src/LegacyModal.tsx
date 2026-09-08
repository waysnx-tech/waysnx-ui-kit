// A project-defined component. Its file imports @waysnx/ui-core → wrapsUiKit.
import { Button } from "@waysnx/ui-core";

export function LegacyModal() {
  return (
    <div className="modal">
      <Button>Close</Button>
    </div>
  );
}
