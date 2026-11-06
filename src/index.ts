import { SpineRenderer } from "./SpineRenderer.ts";
import type { PluginApi } from "./types.ts";

export default function setup(api: PluginApi) {
  api.registerRenderer("spine", () => new SpineRenderer(api));
}
