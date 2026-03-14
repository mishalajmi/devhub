import { DevHubError } from "./devhub.error";

export class AgentCapabilityNotSupported extends DevHubError {
  constructor(capability: string) {
    super(`The current agent does not support this ${capability} `);
    this.name = "AgentCapabilityNotSupported";
  }
}
