# 🏃‍♂️ Decentralized Wellness Challenge Platform

Welcome to a revolutionary way to stay motivated and achieve your wellness goals! This project uses the Stacks blockchain and Clarity smart contracts to create a decentralized platform for collaborative wellness challenges, where participants pool rewards and earn STX for meeting their goals.

## ✨ Features

- 🏆 **Create Challenges**: Start a wellness challenge with custom rules (e.g., 10,000 steps daily for 30 days).
- 💸 **Pool Rewards**: Participants contribute STX to a reward pool, distributed to those who complete the challenge.
- ✅ **Progress Verification**: Use oracles or self-reported proofs to verify challenge progress.
- 📊 **Transparent Results**: All challenge data and outcomes are stored immutably on the blockchain.
- 🎉 **Fair Reward Distribution**: Smart contracts automatically distribute rewards to eligible participants.
- 🔒 **Secure and Trustless**: No central authority; rules are enforced by smart contracts.
- 👥 **Community-Driven**: Join public or private challenges with friends or global participants.

## 🛠 How It Works

**For Participants**
1. Browse or create a wellness challenge (e.g., daily yoga for 7 days).
2. Join by contributing STX to the reward pool.
3. Submit progress (e.g., step count via oracle or proof of gym check-in).
4. If you meet the challenge criteria, receive your share of the reward pool in STX.

**For Challenge Creators**
1. Define challenge parameters (duration, goal, minimum contribution).
2. Deploy the challenge using the `ChallengeFactory` contract.
3. Promote your challenge to attract participants.

**For Verifiers**
1. Oracles or participants submit progress data to the `ProgressOracle` contract.
2. The `RewardDistributor` contract verifies completion and distributes rewards.
