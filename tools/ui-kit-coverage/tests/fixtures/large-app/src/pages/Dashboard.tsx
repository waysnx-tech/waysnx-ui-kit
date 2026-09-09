import { Button, Input, Select } from "@waysnx/ui-core";
import * as Feedback from "@waysnx/ui-feedback";
import { StatCard } from "../components/StatCard.js";

export function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Button>Refresh</Button>
      <Button>Export</Button>
      <Input placeholder="Search" />
      <Select>
        <option>All</option>
      </Select>
      <Feedback.Alert>Heads up</Feedback.Alert>
      <button type="button">native toolbar</button>
      <table>
        <tbody>
          <tr>
            <td>cell</td>
          </tr>
        </tbody>
      </table>
      <StatCard />
      <StatCard />
    </div>
  );
}
