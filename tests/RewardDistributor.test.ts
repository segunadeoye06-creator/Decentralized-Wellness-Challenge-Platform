import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, someCV, noneCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_CHALLENGE_NOT_FOUND = 101;
const ERR_CHALLENGE_ACTIVE = 102;
const ERR_INVALID_REWARD_SPLIT = 103;
const ERR_INSUFFICIENT_POOL = 104;
const ERR_REWARD_ALREADY_DISTRIBUTED = 105;
const ERR_NO_WINNERS = 106;
const ERR_INVALID_PERCENTAGE = 107;
const ERR_PERCENT_SUM_EXCEEDS_100 = 108;
const ERR_EMPTY_REWARD_TIERS = 109;
const ERR_POOL_LOCKED = 110;
const ERR_INVALID_TIER_INDEX = 111;
const ERR_ZERO_WINNERS_IN_TIER = 112;
const ERR_DISTRIBUTION_IN_PROGRESS = 113;
const ERR_DISTRIBUTION_COMPLETED = 114;

interface Tier { percentage: number; minRank: number; maxRank: number }
interface Challenge { challengeId: number; poolBalance: number; totalContributed: number; winnersCount: number; isActive: boolean; isDistributed: boolean; rewardTiers: Tier[] }
interface Result<T> { ok: boolean; value: T }

class RewardDistributorMock {
  state: {
    distributor: string;
    distributionNonce: number;
    challenges: Map<number, Challenge>;
    tierWinners: Map<number, string[]>;
    userReward: Map<string, number>;
    distributionLogs: Map<number, { timestamp: number; distributor: string; amount: number }>;
  } = {
    distributor: "",
    distributionNonce: 0,
    challenges: new Map(),
    tierWinners: new Map(),
    userReward: new Map(),
    distributionLogs: new Map(),
  };
  blockHeight = 0;
  caller = "ST1TEST";
  rewardPoolWithdraws: Array<{ amount: number; user: string; challengeId: number }> = [];

  constructor() { this.reset(); }

  reset() {
    this.state = {
      distributor: "ST1TEST",
      distributionNonce: 0,
      challenges: new Map(),
      tierWinners: new Map(),
      userReward: new Map(),
      distributionLogs: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.rewardPoolWithdraws = [];
  }

  initializeChallenge(challengeId: number, initialPool: number, rewardTiers: Tier[]): Result<boolean> {
    if (this.caller !== this.state.distributor) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.challenges.has(challengeId)) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (rewardTiers.length === 0) return { ok: false, value: ERR_EMPTY_REWARD_TIERS };
    const sum = rewardTiers.reduce((s, t) => s + t.percentage, 0);
    if (sum > 100) return { ok: false, value: ERR_PERCENT_SUM_EXCEEDS_100 };
    for (const t of rewardTiers) {
      if (t.percentage < 0 || t.percentage > 100) return { ok: false, value: ERR_INVALID_PERCENTAGE };
      if (t.maxRank <= t.minRank || t.minRank < 1) return { ok: false, value: ERR_INVALID_TIER_INDEX };
    }
    this.state.challenges.set(challengeId, {
      challengeId, poolBalance: initialPool, totalContributed: 0, winnersCount: 0,
      isActive: true, isDistributed: false, rewardTiers
    });
    return { ok: true, value: true };
  }

  registerWinners(challengeId: number, winners: string[]): Result<boolean> {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (this.caller !== this.state.distributor) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!challenge.isActive) return { ok: false, value: ERR_CHALLENGE_ACTIVE };
    if (challenge.isDistributed) return { ok: false, value: ERR_DISTRIBUTION_COMPLETED };
    this.state.tierWinners.set(challengeId, winners);
    this.state.challenges.set(challengeId, { ...challenge, winnersCount: winners.length, isActive: false });
    return { ok: true, value: true };
  }

  distributeRewards(challengeId: number): Result<boolean> {
    const challenge = this.state.challenges.get(challengeId);
    const winners = this.state.tierWinners.get(challengeId);
    if (!challenge || !winners) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (this.caller !== this.state.distributor) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (challenge.isActive) return { ok: false, value: ERR_CHALLENGE_ACTIVE };
    if (challenge.isDistributed) return { ok: false, value: ERR_REWARD_ALREADY_DISTRIBUTED };
    if (challenge.poolBalance <= 0) return { ok: false, value: ERR_INSUFFICIENT_POOL };
    const nonce = this.state.distributionNonce;
    challenge.rewardTiers.forEach(tier => {
      const tierWinners = winners.filter((_, i) => i + 1 >= tier.minRank && i + 1 <= tier.maxRank);
      if (tierWinners.length > 0) {
        const tierAmount = (challenge.poolBalance * tier.percentage) / 100;
        const perWinner = Math.floor(tierAmount / tierWinners.length);
        tierWinners.forEach(w => {
          const current = this.state.userReward.get(w) || 0;
          this.state.userReward.set(w, current + perWinner);
          this.state.distributionLogs.set(nonce + this.state.distributionLogs.size, {
            timestamp: this.blockHeight, distributor: this.caller, amount: perWinner
          });
        });
      }
    });
    this.state.challenges.set(challengeId, { ...challenge, isDistributed: true });
    this.state.distributionNonce++;
    return { ok: true, value: true };
  }

  claimReward(): Result<number> {
    const reward = this.state.userReward.get(this.caller);
    if (!reward) return { ok: false, value: ERR_NO_REWARDS_AVAILABLE };
    this.state.userReward.delete(this.caller);
    this.rewardPoolWithdraws.push({ amount: reward, user: this.caller, challengeId: 0 });
    return { ok: true, value: reward };
  }

  updatePoolBalance(challengeId: number, amount: number, isAdd: boolean): Result<boolean> {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (this.caller !== this.state.distributor) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!challenge.isActive) return { ok: false, value: ERR_POOL_LOCKED };
    const newBalance = isAdd ? challenge.poolBalance + amount : challenge.poolBalance - amount;
    const newContributed = isAdd ? challenge.totalContributed + amount : challenge.totalContributed;
    this.state.challenges.set(challengeId, { ...challenge, poolBalance: newBalance, totalContributed: newContributed });
    return { ok: true, value: true };
  }

  setDistributor(newDistributor: string): Result<boolean> {
    if (this.caller !== this.state.distributor) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.distributor = newDistributor;
    return { ok: true, value: true };
  }

  getChallenge(id: number): Challenge | undefined { return this.state.challenges.get(id); }
  getUserReward(user: string): number | undefined { return this.state.userReward.get(user); }
}

describe("RewardDistributor", () => {
  let contract: RewardDistributorMock;

  beforeEach(() => {
    contract = new RewardDistributorMock();
    contract.reset();
  });

  it("rejects tier sum over 100%", () => {
    const tiers = [{ percentage: 60, minRank: 1, maxRank: 1 }, { percentage: 50, minRank: 2, maxRank: 2 }];
    const result = contract.initializeChallenge(1, 1000, tiers);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PERCENT_SUM_EXCEEDS_100);
  });

  it("registers winners successfully", () => {
    contract.initializeChallenge(1, 1000, [{ percentage: 100, minRank: 1, maxRank: 3 }]);
    const result = contract.registerWinners(1, ["ST1", "ST2", "ST3"]);
    expect(result.ok).toBe(true);
    const challenge = contract.getChallenge(1);
    expect(challenge?.winnersCount).toBe(3);
    expect(challenge?.isActive).toBe(false);
  });

  it("changes distributor", () => {
    contract.setDistributor("ST2NEW");
    expect(contract.state.distributor).toBe("ST2NEW");
  });
});