import { socialCard } from "./social-card";

export const alt = "AgentTrial — Every agent claim deserves evidence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialCard(size);
}
