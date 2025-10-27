import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, stringUtf8CV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_NAME = 101;
const ERR_INVALID_GOAL = 102;
const ERR_INVALID_DURATION = 103;
const ERR_INVALID_MIN_CONTRIB = 104;
const ERR_INVALID_MAX_PARTS = 105;
const ERR_INVALID_CHALLENGE_TYPE = 106;
const ERR_INVALID_PENALTY_RATE = 107;
const ERR_INVALID_VOTING_THRESHOLD = 108;
const ERR_NAME_TAKEN = 109;
const ERR_FACTORY_LOCKED = 110;
const ERR_MAX_CHALLENGES_EXCEEDED = 111;
const ERR_INVALID_LOCATION = 112;
const ERR_INVALID_CURRENCY = 113;
const ERR_CHALLENGE_EXISTS = 114;
const ERR_INVALID_START_BLOCK = 115;

interface Result<T> {
  ok: boolean;
  value: T;
}

class ChallengeFactoryMock {
  state: {
    factoryAdmin: string;
    nextChallengeId: number;
    maxChallenges: number;
    isFactoryActive: boolean;
    challengeInstances: Map<number, string>;
    challengeByName: Map<string, number>;
  } = {
    factoryAdmin: "",
    nextChallengeId: 0,
    maxChallenges: 1000,
    isFactoryActive: true,
    challengeInstances: new Map(),
    challengeByName: new Map(),
  };
  caller = "ST1ADMIN";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      factoryAdmin: "ST1ADMIN",
      nextChallengeId: 0,
      maxChallenges: 1000,
      isFactoryActive: true,
      challengeInstances: new Map(),
      challengeByName: new Map(),
    };
    this.caller = "ST1ADMIN";
  }

  createChallenge(
    name: string,
    goal: number,
    duration: number,
    minContrib: number,
    maxParts: number,
    ctype: string,
    penaltyRate: number,
    votingThreshold: number,
    location: string,
    currency: string
  ): Result<number> {
    if (!this.state.isFactoryActive)
      return { ok: false, value: ERR_FACTORY_LOCKED };
    if (this.state.nextChallengeId >= this.state.maxChallenges)
      return { ok: false, value: ERR_MAX_CHALLENGES_EXCEEDED };
    if (!name || name.length > 100)
      return { ok: false, value: ERR_INVALID_NAME };
    if (goal <= 0) return { ok: false, value: ERR_INVALID_GOAL };
    if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    if (minContrib <= 0) return { ok: false, value: ERR_INVALID_MIN_CONTRIB };
    if (maxParts <= 0 || maxParts > 100)
      return { ok: false, value: ERR_INVALID_MAX_PARTS };
    if (!["fitness", "meditation", "reading", "sleep"].includes(ctype))
      return { ok: false, value: ERR_INVALID_CHALLENGE_TYPE };
    if (penaltyRate > 100)
      return { ok: false, value: ERR_INVALID_PENALTY_RATE };
    if (votingThreshold <= 0 || votingThreshold > 100)
      return { ok: false, value: ERR_INVALID_VOTING_THRESHOLD };
    if (!location || location.length > 100)
      return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "sBTC"].includes(currency))
      return { ok: false, value: ERR_INVALID_CURRENCY };
    if (this.state.challengeByName.has(name))
      return { ok: false, value: ERR_NAME_TAKEN };

    const id = this.state.nextChallengeId;
    const instance = `challenge-${id}`;
    this.state.challengeInstances.set(id, instance);
    this.state.challengeByName.set(name, id);
    this.state.nextChallengeId++;
    return { ok: true, value: id };
  }

  pauseFactory(): Result<boolean> {
    if (this.caller !== this.state.factoryAdmin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.isFactoryActive = false;
    return { ok: true, value: true };
  }

  resumeFactory(): Result<boolean> {
    if (this.caller !== this.state.factoryAdmin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.isFactoryActive = true;
    return { ok: true, value: true };
  }

  transferAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.factoryAdmin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.factoryAdmin = newAdmin;
    return { ok: true, value: true };
  }

  setMaxChallenges(newMax: number): Result<boolean> {
    if (this.caller !== this.state.factoryAdmin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= this.state.nextChallengeId)
      return { ok: false, value: ERR_INVALID_START_BLOCK };
    this.state.maxChallenges = newMax;
    return { ok: true, value: true };
  }

  getChallengeContract(id: number): string | undefined {
    return this.state.challengeInstances.get(id);
  }
  getChallengeIdByName(name: string): number | undefined {
    return this.state.challengeByName.get(name);
  }
}

describe("ChallengeFactory", () => {
  let factory: ChallengeFactoryMock;

  beforeEach(() => {
    factory = new ChallengeFactoryMock();
    factory.reset();
  });

  it("creates challenge successfully", () => {
    const result = factory.createChallenge(
      "Morning Run",
      10000,
      30,
      100,
      50,
      "fitness",
      5,
      60,
      "City Park",
      "STX"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    expect(factory.getChallengeContract(0)).toBe("challenge-0");
    expect(factory.getChallengeIdByName("Morning Run")).toBe(0);
  });

  it("rejects duplicate name", () => {
    factory.createChallenge(
      "Morning Run",
      10000,
      30,
      100,
      50,
      "fitness",
      5,
      60,
      "City Park",
      "STX"
    );
    const result = factory.createChallenge(
      "Morning Run",
      12000,
      60,
      200,
      30,
      "reading",
      10,
      70,
      "Library",
      "sBTC"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NAME_TAKEN);
  });

  it("enforces factory pause", () => {
    factory.pauseFactory();
    const result = factory.createChallenge(
      "Paused Challenge",
      10000,
      30,
      100,
      50,
      "fitness",
      5,
      60,
      "Park",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_FACTORY_LOCKED);
  });

  it("resumes factory", () => {
    factory.pauseFactory();
    factory.resumeFactory();
    const result = factory.createChallenge(
      "Resumed",
      10000,
      30,
      100,
      50,
      "fitness",
      5,
      60,
      "Park",
      "STX"
    );
    expect(result.ok).toBe(true);
  });

  it("transfers admin", () => {
    factory.transferAdmin("ST2NEW");
    factory.caller = "ST2NEW";
    const result = factory.createChallenge(
      "Admin Test",
      10000,
      30,
      100,
      50,
      "fitness",
      5,
      60,
      "Park",
      "STX"
    );
    expect(result.ok).toBe(true);
  });

  it("rejects invalid max parts", () => {
    const result = factory.createChallenge(
      "Invalid",
      10000,
      30,
      100,
      101,
      "fitness",
      5,
      60,
      "Park",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MAX_PARTS);
  });

  it("enforces max challenges limit", () => {
    factory.setMaxChallenges(1);
    factory.createChallenge(
      "First",
      10000,
      30,
      100,
      50,
      "fitness",
      5,
      60,
      "Park",
      "STX"
    );
    const result = factory.createChallenge(
      "Second",
      12000,
      60,
      200,
      30,
      "reading",
      10,
      70,
      "Library",
      "sBTC"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CHALLENGES_EXCEEDED);
  });
});
