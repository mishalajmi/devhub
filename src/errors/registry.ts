import { DevHubError } from "./index";

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
