import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, stringUtf8CV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_GOAL = 101;
const ERR_INVALID_DURATION = 102;
const ERR_INVALID_MIN_CONTRIB = 103;
const ERR_CHALLENGE_NOT_ACTIVE = 104;
const ERR_CHALLENGE_ENDED = 105;
const ERR_ALREADY_JOINED = 106;
const ERR_NOT_JOINED = 107;
const ERR_INVALID_PROGRESS = 108;
const ERR_INVALID_ORACLE = 109;
const ERR_INVALID_REWARD_SPLIT = 110;
const ERR_INSUFFICIENT_CONTRIB = 111;
const ERR_MAX_PARTICIPANTS_EXCEEDED = 112;
const ERR_INVALID_START_TIME = 113;
const ERR_INVALID_END_TIME = 114;
const ERR_REWARD_ALREADY_CLAIMED = 115;
const ERR_NO_REWARDS_AVAILABLE = 116;
const ERR_INVALID_CHALLENGE_TYPE = 117;
const ERR_INVALID_PENALTY_RATE = 118;
const ERR_INVALID_VOTING_THRESHOLD = 119;
const ERR_INVALID_LOCATION = 120;
const ERR_INVALID_CURRENCY = 121;
const ERR_INVALID_STATUS = 122;
const ERR_MAX_CHALLENGES_EXCEEDED = 123;
const ERR_INVALID_UPDATE_PARAM = 124;

interface Participant {
  contribution: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

interface ChallengeDetails {
  id: number;
  goal: number;
  duration: number;
  minContribution: number;
  maxParticipants: number;
  isActive: boolean;
  startTime: number;
  endTime: number;
  creator: string;
  challengeType: string;
  penaltyRate: number;
  votingThreshold: number;
  location: string;
  currency: string;
  status: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ChallengeInstanceMock {
  state: {
    challengeId: number;
    goal: number;
    duration: number;
    minContribution: number;
    maxParticipants: number;
    isActive: boolean;
    startTime: number;
    endTime: number;
    creator: string;
    challengeType: string;
    penaltyRate: number;
    votingThreshold: number;
    location: string;
    currency: string;
    status: boolean;
    oraclePrincipal: string | null;
    participants: Map<string, Participant>;
    progressSubmissions: Map<string, number>;
    votes: Map<string, boolean>;
  } = {
    challengeId: 0,
    goal: 0,
    duration: 0,
    minContribution: 0,
    maxParticipants: 50,
    isActive: true,
    startTime: 0,
    endTime: 0,
    creator: "",
    challengeType: "",
    penaltyRate: 0,
    votingThreshold: 0,
    location: "",
    currency: "STX",
    status: true,
    oraclePrincipal: null,
    participants: new Map(),
    progressSubmissions: new Map(),
    votes: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  rewardPoolDeposits: Array<{ amount: number; user: string; challengeId: number }> = [];
  rewardPoolWithdraws: Array<{ amount: number; user: string; challengeId: number }> = [];
  penalties: Array<{ amount: number; user: string; challengeId: number }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      challengeId: 0,
      goal: 0,
      duration: 0,
      minContribution: 0,
      maxParticipants: 50,
      isActive: true,
      startTime: 0,
      endTime: 0,
      creator: "",
      challengeType: "",
      penaltyRate: 0,
      votingThreshold: 0,
      location: "",
      currency: "STX",
      status: true,
      oraclePrincipal: null,
      participants: new Map(),
      progressSubmissions: new Map(),
      votes: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.rewardPoolDeposits = [];
    this.rewardPoolWithdraws = [];
    this.penalties = [];
  }

  initialize(
    id: number,
    challengeGoal: number,
    challengeDuration: number,
    minContrib: number,
    maxParts: number,
    ctype: string,
    prate: number,
    vthresh: number,
    loc: string,
    cur: string
  ): Result<boolean> {
    if (this.caller !== this.state.creator) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (challengeGoal <= 0) return { ok: false, value: ERR_INVALID_GOAL };
    if (challengeDuration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    if (minContrib <= 0) return { ok: false, value: ERR_INVALID_MIN_CONTRIB };
    if (maxParts <= 0 || maxParts > 100) return { ok: false, value: ERR_MAX_PARTICIPANTS_EXCEEDED };
    if (!["fitness", "meditation", "reading"].includes(ctype)) return { ok: false, value: ERR_INVALID_CHALLENGE_TYPE };
    if (prate > 100) return { ok: false, value: ERR_INVALID_PENALTY_RATE };
    if (vthresh <= 0 || vthresh > 100) return { ok: false, value: ERR_INVALID_VOTING_THRESHOLD };
    if (!loc || loc.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "BTC"].includes(cur)) return { ok: false, value: ERR_INVALID_CURRENCY };
    this.state.challengeId = id;
    this.state.goal = challengeGoal;
    this.state.duration = challengeDuration;
    this.state.minContribution = minContrib;
    this.state.maxParticipants = maxParts;
    this.state.startTime = this.blockHeight;
    this.state.endTime = this.blockHeight + challengeDuration;
    this.state.challengeType = ctype;
    this.state.penaltyRate = prate;
    this.state.votingThreshold = vthresh;
    this.state.location = loc;
    this.state.currency = cur;
    return { ok: true, value: true };
  }

  joinChallenge(contribution: number): Result<boolean> {
    if (!this.state.isActive) return { ok: false, value: ERR_CHALLENGE_NOT_ACTIVE };
    if (this.blockHeight >= this.state.endTime) return { ok: false, value: ERR_CHALLENGE_ENDED };
    if (this.state.participants.has(this.caller)) return { ok: false, value: ERR_ALREADY_JOINED };
    if (contribution < this.state.minContribution) return { ok: false, value: ERR_INSUFFICIENT_CONTRIB };
    if (this.state.participants.size >= this.state.maxParticipants) return { ok: false, value: ERR_MAX_PARTICIPANTS_EXCEEDED };
    this.rewardPoolDeposits.push({ amount: contribution, user: this.caller, challengeId: this.state.challengeId });
    this.state.participants.set(this.caller, { contribution, progress: 0, completed: false, claimed: false });
    return { ok: true, value: true };
  }

  submitProgress(progressValue: number): Result<boolean> {
    const participant = this.state.participants.get(this.caller);
    if (!participant) return { ok: false, value: ERR_NOT_JOINED };
    if (!this.state.isActive) return { ok: false, value: ERR_CHALLENGE_NOT_ACTIVE };
    if (this.blockHeight >= this.state.endTime) return { ok: false, value: ERR_CHALLENGE_ENDED };
    if (progressValue < participant.progress) return { ok: false, value: ERR_INVALID_PROGRESS };
    this.state.participants.set(this.caller, { ...participant, progress: progressValue });
    if (progressValue >= this.state.goal) {
      this.state.participants.set(this.caller, { ...participant, progress: progressValue, completed: true });
    }
    return { ok: true, value: true };
  }

  endChallenge(): Result<boolean> {
    if (this.caller !== this.state.creator) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.blockHeight < this.state.endTime) return { ok: false, value: ERR_INVALID_END_TIME };
    this.state.isActive = false;
    this.state.status = false;
    return { ok: true, value: true };
  }

  claimReward(): Result<number> {
    const participant = this.state.participants.get(this.caller);
    if (!participant) return { ok: false, value: ERR_NOT_JOINED };
    if (this.state.isActive) return { ok: false, value: ERR_CHALLENGE_NOT_ACTIVE };
    if (!participant.completed) return { ok: false, value: ERR_INVALID_STATUS };
    if (participant.claimed) return { ok: false, value: ERR_REWARD_ALREADY_CLAIMED };
    const reward = 100;
    if (reward <= 0) return { ok: false, value: ERR_NO_REWARDS_AVAILABLE };
    this.rewardPoolWithdraws.push({ amount: reward, user: this.caller, challengeId: this.state.challengeId });
    this.state.participants.set(this.caller, { ...participant, claimed: true });
    return { ok: true, value: reward };
  }

  voteOnExtension(vote: boolean): Result<boolean> {
    if (!this.state.participants.has(this.caller)) return { ok: false, value: ERR_NOT_JOINED };
    if (!this.state.isActive) return { ok: false, value: ERR_CHALLENGE_NOT_ACTIVE };
    this.state.votes.set(this.caller, vote);
    return { ok: true, value: true };
  }

  applyPenalty(user: string): Result<number> {
    if (this.caller !== this.state.creator) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const participant = this.state.participants.get(user);
    if (!participant) return { ok: false, value: ERR_NOT_JOINED };
    if (participant.completed) return { ok: false, value: ERR_INVALID_STATUS };
    const penalty = (participant.contribution * this.state.penaltyRate) / 100;
    this.penalties.push({ amount: penalty, user, challengeId: this.state.challengeId });
    return { ok: true, value: penalty };
  }

  setOracle(oracle: string): Result<boolean> {
    if (this.caller !== this.state.creator) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.oraclePrincipal = oracle;
    return { ok: true, value: true };
  }

  getChallengeDetails(): Result<ChallengeDetails> {
    return { ok: true, value: {
      id: this.state.challengeId,
      goal: this.state.goal,
      duration: this.state.duration,
      minContribution: this.state.minContribution,
      maxParticipants: this.state.maxParticipants,
      isActive: this.state.isActive,
      startTime: this.state.startTime,
      endTime: this.state.endTime,
      creator: this.state.creator,
      challengeType: this.state.challengeType,
      penaltyRate: this.state.penaltyRate,
      votingThreshold: this.state.votingThreshold,
      location: this.state.location,
      currency: this.state.currency,
      status: this.state.status
    } };
  }

  getParticipant(user: string): Participant | null {
    return this.state.participants.get(user) || null;
  }
}

describe("ChallengeInstance", () => {
  let contract: ChallengeInstanceMock;

  beforeEach(() => {
    contract = new ChallengeInstanceMock();
    contract.reset();
    contract.state.creator = "ST1TEST";
  });

  it("initializes challenge successfully", () => {
    const result = contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const details = contract.getChallengeDetails().value;
    expect(details.id).toBe(1);
    expect(details.goal).toBe(10000);
    expect(details.duration).toBe(30);
    expect(details.minContribution).toBe(100);
    expect(details.maxParticipants).toBe(50);
    expect(details.challengeType).toBe("fitness");
    expect(details.penaltyRate).toBe(5);
    expect(details.votingThreshold).toBe(50);
    expect(details.location).toBe("Global");
    expect(details.currency).toBe("STX");
  });

  it("rejects initialization by non-creator", () => {
    contract.caller = "ST2FAKE";
    const result = contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("joins challenge successfully", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    const result = contract.joinChallenge(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const participant = contract.getParticipant("ST1TEST");
    expect(participant?.contribution).toBe(200);
    expect(participant?.progress).toBe(0);
    expect(participant?.completed).toBe(false);
    expect(participant?.claimed).toBe(false);
    expect(contract.rewardPoolDeposits).toEqual([{ amount: 200, user: "ST1TEST", challengeId: 1 }]);
  });

  it("rejects join if already joined", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    contract.joinChallenge(200);
    const result = contract.joinChallenge(300);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_JOINED);
  });

  it("submits progress successfully", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    contract.joinChallenge(200);
    const result = contract.submitProgress(5000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const participant = contract.getParticipant("ST1TEST");
    expect(participant?.progress).toBe(5000);
    expect(participant?.completed).toBe(false);
  });

  it("marks completed on goal achievement", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    contract.joinChallenge(200);
    const result = contract.submitProgress(10000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const participant = contract.getParticipant("ST1TEST");
    expect(participant?.progress).toBe(10000);
    expect(participant?.completed).toBe(true);
  });

  it("ends challenge successfully", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    contract.blockHeight = 30;
    const result = contract.endChallenge();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.isActive).toBe(false);
    expect(contract.state.status).toBe(false);
  });

  it("rejects end challenge before time", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    contract.blockHeight = 29;
    const result = contract.endChallenge();
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_END_TIME);
  });

  it("claims reward successfully", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    contract.joinChallenge(200);
    contract.submitProgress(10000);
    contract.blockHeight = 30;
    contract.endChallenge();
    const result = contract.claimReward();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(100);
    const participant = contract.getParticipant("ST1TEST");
    expect(participant?.claimed).toBe(true);
    expect(contract.rewardPoolWithdraws).toEqual([{ amount: 100, user: "ST1TEST", challengeId: 1 }]);
  });

  it("rejects claim if not completed", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    contract.joinChallenge(200);
    contract.blockHeight = 30;
    contract.endChallenge();
    const result = contract.claimReward();
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("votes on extension successfully", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    contract.joinChallenge(200);
    const result = contract.voteOnExtension(true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.votes.get("ST1TEST")).toBe(true);
  });

  it("applies penalty successfully", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    contract.joinChallenge(200);
    const result = contract.applyPenalty("ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(10);
    expect(contract.penalties).toEqual([{ amount: 10, user: "ST1TEST", challengeId: 1 }]);
  });

  it("sets oracle successfully", () => {
    contract.initialize(1, 10000, 30, 100, 50, "fitness", 5, 50, "Global", "STX");
    const result = contract.setOracle("ST3ORACLE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.oraclePrincipal).toBe("ST3ORACLE");
  });
});