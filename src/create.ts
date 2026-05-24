// createBacklog factory — the kit's main entry point.
//
// SCAFFOLDING SHIM (#955). Real implementation lands across #956-#959.
// Throwing here keeps consumers from accidentally building against the
// shim; the kit's package.json version stays at 0.1.0 until #961 lands.

import type {
  BacklogConfig,
  BacklogKit,
  KitUser,
} from "./types.js";

export function createBacklog<
  U extends KitUser = KitUser,
  Category extends string = string,
  Kind extends string = string,
>(config: BacklogConfig<U, Category, Kind>): BacklogKit<U, Category, Kind> {
  const notImplemented = (name: string) => async (): Promise<never> => {
    throw new Error(
      `backlog-kit v0.1.0 scaffolding: ${name}() not implemented yet (intake #957)`,
    );
  };

  return {
    fileIntake: notImplemented("fileIntake"),
    triageIntake: notImplemented("triageIntake"),
    transitionState: notImplemented("transitionState"),
    shipBatch: notImplemented("shipBatch"),
    checkShipGate: notImplemented("checkShipGate"),
    queryAccepted: notImplemented("queryAccepted"),
    queryByState: notImplemented("queryByState"),
    pickNext: notImplemented("pickNext"),
    getById: notImplemented("getById"),
    getBySeq: notImplemented("getBySeq"),
    getChildren: notImplemented("getChildren"),
    getLogicalNext: notImplemented("getLogicalNext"),
    addComment: notImplemented("addComment"),
    getComments: notImplemented("getComments"),
    _config: config,
  };
}
