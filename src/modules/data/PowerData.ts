import type { PowerData } from "../types";
import { DEFAULT_TYPE, normalizePower } from "../core/powers";

type PowerSchema = {
  name: foundry.data.fields.DataField.Any;
  type: foundry.data.fields.DataField.Any;
  description: foundry.data.fields.DataField.Any;
  damage: foundry.data.fields.DataField.Any;
  pp: foundry.data.fields.DataField.Any;
  maxPp: foundry.data.fields.DataField.Any;
  effect: foundry.data.fields.DataField.Any;
  requiresSave: foundry.data.fields.DataField.Any;
  saveType: foundry.data.fields.DataField.Any;
};

/** Foundry runtime only — extends `foundry.abstract.DataModel` at import time,
    so importing this module in Node/Vitest fails. */
export class PowerDataModel extends foundry.abstract.DataModel<PowerSchema, null> {
  static override defineSchema(): PowerSchema {
    return {
      name: new foundry.data.fields.StringField({ required: true, blank: false, initial: "" }),
      type: new foundry.data.fields.StringField({ initial: DEFAULT_TYPE }),
      description: new foundry.data.fields.StringField({ initial: "" }),
      damage: new foundry.data.fields.StringField({ initial: "" }),
      pp: new foundry.data.fields.NumberField({ integer: true, min: 0, initial: 1 }),
      maxPp: new foundry.data.fields.NumberField({ integer: true, min: 0, initial: 1 }),
      effect: new foundry.data.fields.StringField({ initial: "" }),
      requiresSave: new foundry.data.fields.BooleanField({ initial: false }),
      saveType: new foundry.data.fields.StringField({ initial: "" })
    };
  }
}

export function castPower(source: unknown): PowerData {
  const model = new PowerDataModel();
  const schema = model.schema as unknown as { cast(data: unknown): Record<string, unknown> };
  return normalizePower(schema.cast(source ?? {}) as Partial<PowerData>);
}
