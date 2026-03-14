import { DevHubError } from "./devhub.error";

export class DriverNotFoundError extends DevHubError {
  constructor(id: string) {
    super(`No agent driver registered with id: "${id}"`);
    this.name = "DriverNotFoundError";
  }
}

export class DriverAlreadyRegisteredError extends DevHubError {
  constructor(id: string) {
    super(`Agent driver with id: "${id}" is already registered`);
    this.name = "DriverAlreadyRegisteredError";
  }
}

export class DriverLoadError extends DevHubError {
  constructor(path: string, reason: string) {
    super(`Failed to load driver from "${path}": ${reason}`);
    this.name = "DriverLoadError";
  }
}

export class DriverValidationError extends DevHubError {
  constructor(fields: string[]) {
    super(`Driver validation failed for the following errors: ${fields.map(f => ` -${f}`).join("\n")}`)
    this.name = "DriverValidationError";
  }
}
