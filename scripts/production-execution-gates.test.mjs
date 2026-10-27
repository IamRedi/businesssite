import test from "node:test";
import assert from "node:assert/strict";
import { masterExecutionGateNames, unsafeProductionMasterGates } from "./production-execution-gates.mjs";

test("Production candidate requires every master gate explicitly false", () => {
  assert.deepEqual(unsafeProductionMasterGates(Object.fromEntries(masterExecutionGateNames.map((name) => [name, "false"])), true), []);
  for (const name of masterExecutionGateNames) {
    for (const value of [undefined, "", "true", "FALSE", " false "]) {
      const candidate = Object.fromEntries(masterExecutionGateNames.map((item) => [item, "false"]));
      candidate[name] = value;
      assert.match(unsafeProductionMasterGates(candidate, true).join(" "), new RegExp(name));
    }
  }
});

test("non-Production development does not assert a release candidate", () => {
  assert.deepEqual(unsafeProductionMasterGates({}, false), []);
});
