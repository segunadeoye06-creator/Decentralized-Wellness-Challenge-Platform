(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-CHALLENGE-NOT-FOUND u101)
(define-constant ERR-CHALLENGE-ACTIVE u102)
(define-constant ERR-INVALID-REWARD-SPLIT u103)
(define-constant ERR-INSUFFICIENT-POOL u104)
(define-constant ERR-REWARD-ALREADY-DISTRIBUTED u105)
(define-constant ERR-NO-WINNERS u106)
(define-constant ERR-INVALID-PERCENTAGE u107)
(define-constant ERR-PERCENT-SUM-EXCEEDS-100 u108)
(define-constant ERR-EMPTY-REWARD-TIERS u109)
(define-constant ERR-POOL-LOCKED u110)
(define-constant ERR-INVALID-TIER-INDEX u111)
(define-constant ERR-ZERO-WINNERS-IN-TIER u112)
(define-constant ERR-DISTRIBUTION-IN-PROGRESS u113)
(define-constant ERR-DISTRIBUTION-COMPLETED u114)

(define-data-var distributor principal tx-sender)
(define-data-var distribution-nonce uint u0)

(define-map challenges uint {
  challenge-id: uint,
  pool-balance: uint,
  total-contributed: uint,
  winners-count: uint,
  is-active: bool,
  is-distributed: bool,
  reward-tiers: (list 10 { percentage: uint, min-rank: uint, max-rank: uint })
})

(define-map tier-winners uint (list 200 principal))
(define-map user-reward principal uint)
(define-map distribution-logs uint { timestamp: uint, distributor: principal, amount: uint })

(define-read-only (get-challenge (id uint))
  (map-get? challenges id)
)

(define-read-only (get-user-reward (user principal))
  (map-get? user-reward user)
)

(define-read-only (get-tier-winners (challenge-id uint))
  (map-get? tier-winners challenge-id)
)

(define-private (validate-percentage (p uint))
  (if (and (>= p u0) (<= p u100)) (ok true) (err ERR-INVALID-PERCENTAGE))
)

(define-private (validate-tier (tier { percentage: uint, min-rank: uint, max-rank: uint }))
  (let ((pct (get percentage tier))
        (min-r (get min-rank tier))
        (max-r (get max-rank tier)))
    (try! (validate-percentage pct))
    (if (and (> max-r min-r) (>= min-r u1)) (ok true) (err ERR-INVALID-TIER-INDEX))
  )
)

(define-private (sum-percentages (tiers (list 10 { percentage: uint, min-rank: uint, max-rank: uint })))
  (fold + (map (lambda (t) (get percentage t)) tiers) u0)
)

(define-public (initialize-challenge 
  (challenge-id uint)
  (initial-pool uint)
  (reward-tiers (list 10 { percentage: uint, min-rank: uint, max-rank: uint })))
  (begin
    (asserts! (is-eq tx-sender (var-get distributor)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (map-get? challenges challenge-id)) (err ERR-CHALLENGE-NOT-FOUND))
    (asserts! (> (len reward-tiers) u0) (err ERR-EMPTY-REWARD-TIERS))
    (try! (fold and (map validate-tier reward-tiers) (ok true)))
    (asserts! (<= (sum-percentages reward-tiers) u100) (err ERR-PERCENT-SUM-EXCEEDS-100))
    (map-set challenges challenge-id {
      challenge-id: challenge-id,
      pool-balance: initial-pool,
      total-contributed: u0,
      winners-count: u0,
      is-active: true,
      is-distributed: false,
      reward-tiers: reward-tiers
    })
    (ok true)
  )
)

(define-public (register-winners 
  (challenge-id uint)
  (winners (list 200 principal)))
  (let ((challenge (unwrap! (map-get? challenges challenge-id) (err ERR-CHALLENGE-NOT-FOUND))))
    (asserts! (is-eq tx-sender (var-get distributor)) (err ERR-NOT-AUTHORIZED))
    (asserts! (get is-active challenge) (err ERR-CHALLENGE-ACTIVE))
    (asserts! (not (get is-distributed challenge)) (err ERR-DISTRIBUTION-COMPLETED))
    (map-set tier-winners challenge-id winners)
    (map-set challenges challenge-id (merge challenge {
      winners-count: (len winners),
      is-active: false
    }))
    (ok true)
  )
)

(define-public (distribute-rewards (challenge-id uint))
  (let ((challenge (unwrap! (map-get? challenges challenge-id) (err ERR-CHALLENGE-NOT-FOUND)))
        (winners (unwrap! (map-get? tier-winners challenge-id) (err ERR-NO-WINNERS)))
        (nonce (var-get distribution-nonce)))
    (asserts! (is-eq tx-sender (var-get distributor)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get is-active challenge)) (err ERR-CHALLENGE-ACTIVE))
    (asserts! (not (get is-distributed challenge)) (err ERR-REWARD-ALREADY-DISTRIBUTED))
    (asserts! (> (get pool-balance challenge) u0) (err ERR-INSUFFICIENT-POOl))
    (let ((tiers (get reward-tiers challenge))
          (total-winners (len winners)))
      (fold 
        (lambda (tier acc)
          (let ((pct (get percentage tier))
                (min-r (get min-rank tier))
                (max-r (get max-rank tier))
                (tier-winners (filter (lambda (i) (and (>= i min-r) (<= i max-r))) (range u1 (+ total-winners u1))))
                (tier-size (len tier-winners))
                (tier-amount (/ (* (get pool-balance challenge) pct) u100)))
            (if (> tier-size u0)
              (let ((per-winner (/ tier-amount tier-size)))
                (fold 
                  (lambda (rank unused)
                    (let ((winner (unwrap-panic (element-at winners (- rank u1)))))
                      (map-set user-reward winner (+ (default-to u0 (map-get? user-reward winner)) per-winner))
                      (map-set distribution-logs (+ nonce (len (map-keys distribution-logs)))
                        { timestamp: block-height, distributor: tx-sender, amount: per-winner })
                      (ok true)
                    )
                  )
                  tier-winners
                  (ok true)
                )
              )
              (ok true)
            )
          )
        )
        tiers
        (ok true)
      )
      (map-set challenges challenge-id (merge challenge { is-distributed: true }))
      (var-set distribution-nonce (+ nonce u1))
      (ok true)
    )
  )
)

(define-public (claim-reward)
  (let ((reward (unwrap! (map-get? user-reward tx-sender) (err ERR-NO-REWARDS-AVAILABLE))))
    (map-delete user-reward tx-sender)
    (try! (contract-call? .RewardPool withdraw reward tx-sender u0))
    (ok reward)
  )
)

(define-public (update-pool-balance (challenge-id uint) (amount uint) (is-add bool))
  (let ((challenge (unwrap! (map-get? challenges challenge-id) (err ERR-CHALLENGE-NOT-FOUND))))
    (asserts! (is-eq tx-sender (var-get distributor)) (err ERR-NOT-AUTHORIZED))
    (asserts! (get is-active challenge) (err ERR-POOL-LOCKED))
    (map-set challenges challenge-id (merge challenge {
      pool-balance: (if is-add (+ (get pool-balance challenge) amount) (- (get pool-balance challenge) amount)),
      total-contributed: (if is-add (+ (get total-contributed challenge) amount) (get total-contributed challenge))
    }))
    (ok true)
  )
)

(define-public (set-distributor (new-distributor principal))
  (begin
    (asserts! (is-eq tx-sender (var-get distributor)) (err ERR-NOT-AUTHORIZED))
    (var-set distributor new-distributor)
    (ok true)
  )
)