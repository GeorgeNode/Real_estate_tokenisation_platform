;; Define constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-already-tokenized (err u103))
(define-constant err-insufficient-tokens (err u104))
(define-constant err-not-tokenized (err u105))
(define-constant err-transfer-failed (err u106))
(define-constant err-invalid-token-amount (err u107))
(define-constant err-property-not-for-sale (err u108))
(define-constant err-invalid-price (err u109))
(define-constant err-not-token-owner (err u110))
(define-constant err-listing-not-found (err u111))
(define-constant platform-fee-percentage u25) ;; 2.5% fee

;; Define data variables
(define-data-var total-properties uint u0)
(define-data-var total-listings uint u0)
(define-data-var total-transactions uint u0)
(define-data-var platform-revenue uint u0)
(define-data-var contract-paused bool false)

;; Define data maps
(define-map properties
  uint
  {
    owner: principal,
    price: uint,
    location: (string-ascii 50),
    tokenized: bool,
    property-type: (string-ascii 20),
    area: uint,
    for-sale: bool,
    creation-block: uint,
    description: (string-ascii 200)
  }
)

(define-map token-listings
  uint
  {
    seller: principal,
    property-id: uint,
    token-amount: uint,
    price-per-token: uint,
    active: bool
  }
)


(define-map property-tokens
  uint
  {
    total-supply: uint,
    tokens-remaining: uint,
    token-price: uint, ;; Price per token
    creator: principal
  }
)

(define-map token-ownership
  { property-id: uint, owner: principal }
  { token-count: uint }
)

(define-map property-transactions
  uint ;; transaction-id
  {
    property-id: uint,
    seller: principal,
    buyer: principal,
    amount: uint,
    tokens: uint,
    block-height: uint,
    transaction-type: (string-ascii 20) ;; "MINT", "TRANSFER", "LISTING"
  }
)

(define-map user-properties
  principal
  { owned-properties: (list 100 uint) }
)

;; Define non-fungible token
(define-non-fungible-token property-token uint)


;; Helper functions

(define-private (calculate-platform-fee (amount uint))
  (/ (* amount platform-fee-percentage) u1000)
)

(define-private (is-contract-owner)
  (is-eq tx-sender contract-owner)
)

(define-private (transfer-token (token-id uint) (sender principal) (recipient principal))
  (nft-transfer? property-token token-id sender recipient)
)

(define-private (log-transaction (property-id uint) (seller principal) (buyer principal) (amount uint) (tokens uint) (tx-type (string-ascii 20)))
  (let ((tx-id (var-get total-transactions)))
    (map-set property-transactions tx-id {
      property-id: property-id,
      seller: seller,
      buyer: buyer,
      amount: amount,
      tokens: tokens,
      block-height: block-height,
      transaction-type: tx-type
    })
    (var-set total-transactions (+ tx-id u1))
    tx-id
  )
)

(define-private (add-to-user-properties (user principal) (property-id uint))
  (let ((existing-properties (default-to { owned-properties: (list) } (map-get? user-properties user))))
    (match (as-max-len? (append (get owned-properties existing-properties) property-id) u100)
      success-result (begin
        (map-set user-properties 
          user
          { owned-properties: success-result }
        )
        true
      )
      false
    )
  )
)


;; Add a new property
(define-public (add-property (price uint) (location (string-ascii 50)) (property-type (string-ascii 20)) (area uint) (description (string-ascii 200)))
  (let ((property-id (var-get total-properties)))
    (asserts! (not (var-get contract-paused)) err-unauthorized)
    (asserts! (> price u0) err-invalid-price)
    (if (is-contract-owner)
      (begin
        (map-set properties property-id {
          owner: contract-owner,
          price: price,
          location: location,
          tokenized: false,
          property-type: property-type,
          area: area,
          for-sale: false,
          creation-block: block-height,
          description: description
        })
        (var-set total-properties (+ property-id u1))
        (add-to-user-properties contract-owner property-id)
        (ok property-id)
      )
      err-owner-only
    )
  )
)

;; Update property details
(define-public (update-property (property-id uint) (price uint) (for-sale bool) (description (string-ascii 200)))
  (let ((property (unwrap! (map-get? properties property-id) err-not-found)))
    (asserts! (not (var-get contract-paused)) err-unauthorized)
    (asserts! (is-eq tx-sender (get owner property)) err-unauthorized)
    (asserts! (> price u0) err-invalid-price)
    (map-set properties property-id 
      (merge property { 
        price: price, 
        for-sale: for-sale,
        description: description
      })
    )
    (ok true)
  )
)

;; Tokenize a property
(define-public (tokenize-property (property-id uint) (total-tokens uint) (token-price uint))
  (let ((property (unwrap! (map-get? properties property-id) err-not-found)))
    (asserts! (not (var-get contract-paused)) err-unauthorized)
    (asserts! (is-eq (get owner property) tx-sender) err-unauthorized)
    (asserts! (not (get tokenized property)) err-already-tokenized)
    (asserts! (> total-tokens u0) err-invalid-token-amount)
    (asserts! (> token-price u0) err-invalid-price)
    
    (map-set properties property-id (merge property { tokenized: true }))
    (map-set property-tokens property-id {
      total-supply: total-tokens,
      tokens-remaining: total-tokens,
      token-price: token-price,
      creator: tx-sender
    })
    
    ;; Set initial token ownership
    (map-set token-ownership 
      { property-id: property-id, owner: tx-sender }
      { token-count: u0 }
    )
    
    (ok true)
  )
)

;; Buy property tokens directly from the property
(define-public (buy-tokens (property-id uint) (token-amount uint))
  (let (
    (property (unwrap! (map-get? properties property-id) err-not-found))
    (tokens (unwrap! (map-get? property-tokens property-id) err-not-found))
    (platform-fee (calculate-platform-fee (* token-amount (get token-price tokens))))
    (total-cost (+ (* token-amount (get token-price tokens)) platform-fee))
  )
    (asserts! (not (var-get contract-paused)) err-unauthorized)
    (asserts! (get tokenized property) err-not-tokenized)
    (asserts! (<= token-amount (get tokens-remaining tokens)) err-insufficient-tokens)
    (asserts! (> token-amount u0) err-invalid-token-amount)
    
    ;; Transfer STX to property owner
    (try! (stx-transfer? total-cost tx-sender (get creator tokens)))
    
    ;; Update platform revenue
    (var-set platform-revenue (+ (var-get platform-revenue) platform-fee))
    
    ;; Update property tokens remaining
    (map-set property-tokens property-id 
      (merge tokens { tokens-remaining: (- (get tokens-remaining tokens) token-amount) })
    )
    
    ;; Update token ownership
    (let ((current-ownership (default-to { token-count: u0 } 
                              (map-get? token-ownership { property-id: property-id, owner: tx-sender }))))
      (map-set token-ownership 
        { property-id: property-id, owner: tx-sender }
        { token-count: (+ (get token-count current-ownership) token-amount) }
      )
    )
    
    ;; Log the transaction
    (log-transaction property-id (get creator tokens) tx-sender total-cost token-amount "MINT")
    
    (ok true)
  )
)

;; Purchase an entire property (non-tokenized)
(define-public (buy-property (property-id uint))
  (let (
    (property (unwrap! (map-get? properties property-id) err-not-found))
    (platform-fee (calculate-platform-fee (get price property)))
    (total-cost (+ (get price property) platform-fee))
  )
    (asserts! (not (var-get contract-paused)) err-unauthorized)
    (asserts! (not (get tokenized property)) err-already-tokenized)
    (asserts! (get for-sale property) err-property-not-for-sale)
    
    ;; Transfer STX to property owner
    (try! (stx-transfer? total-cost tx-sender (get owner property)))
    
    ;; Update platform revenue
    (var-set platform-revenue (+ (var-get platform-revenue) platform-fee))
    
    ;; Update property ownership
    (map-set properties property-id 
      (merge property { 
        owner: tx-sender,
        for-sale: false
      })
    )
    
    ;; Update user properties lists
    (add-to-user-properties tx-sender property-id)
    
    ;; Log the transaction
    (log-transaction property-id (get owner property) tx-sender total-cost u1 "TRANSFER")
    
    (ok true)
  )
)


;; Create a secondary market listing for tokens
(define-public (create-token-listing (property-id uint) (token-amount uint) (price-per-token uint))
  (let (
    (property (unwrap! (map-get? properties property-id) err-not-found))
    (listing-id (var-get total-listings))
    (ownership (default-to { token-count: u0 } 
                (map-get? token-ownership { property-id: property-id, owner: tx-sender })))
  )
    (asserts! (not (var-get contract-paused)) err-unauthorized)
    (asserts! (get tokenized property) err-not-tokenized)
    (asserts! (>= (get token-count ownership) token-amount) err-insufficient-tokens)
    (asserts! (> token-amount u0) err-invalid-token-amount)
    (asserts! (> price-per-token u0) err-invalid-price)
    
    ;; Create the listing
    (map-set token-listings listing-id {
      seller: tx-sender,
      property-id: property-id,
      token-amount: token-amount,
      price-per-token: price-per-token,
      active: true
    })
    
    ;; Update total listings
    (var-set total-listings (+ listing-id u1))
    
    ;; Log the transaction
    (log-transaction property-id tx-sender tx-sender u0 token-amount "LISTING")
    
    (ok listing-id)
  )
)

;; Buy tokens from a secondary market listing
(define-public (buy-listed-tokens (listing-id uint))
  (let (
    (listing (unwrap! (map-get? token-listings listing-id) err-listing-not-found))
    (property-id (get property-id listing))
    (total-cost (* (get token-amount listing) (get price-per-token listing)))
    (platform-fee (calculate-platform-fee total-cost))
    (seller-amount (- total-cost platform-fee))
  )
    (asserts! (not (var-get contract-paused)) err-unauthorized)
    (asserts! (get active listing) err-listing-not-found)
    (asserts! (not (is-eq tx-sender (get seller listing))) err-unauthorized)
    
    ;; Transfer STX to seller
    (try! (stx-transfer? seller-amount tx-sender (get seller listing)))
    
    ;; Transfer platform fee
    (try! (stx-transfer? platform-fee tx-sender contract-owner))
    
    ;; Update platform revenue
    (var-set platform-revenue (+ (var-get platform-revenue) platform-fee))
    
    ;; Update seller's token ownership
    (let ((seller-ownership (unwrap! (map-get? token-ownership 
                                      { property-id: property-id, owner: (get seller listing) }) 
                            err-not-token-owner)))
      (map-set token-ownership 
        { property-id: property-id, owner: (get seller listing) }
        { token-count: (- (get token-count seller-ownership) (get token-amount listing)) }
      )
    )
    
    ;; Update buyer's token ownership
    (let ((buyer-ownership (default-to { token-count: u0 } 
                            (map-get? token-ownership { property-id: property-id, owner: tx-sender }))))
      (map-set token-ownership 
        { property-id: property-id, owner: tx-sender }
        { token-count: (+ (get token-count buyer-ownership) (get token-amount listing)) }
      )
    )
    
    ;; Deactivate the listing
    (map-set token-listings listing-id 
      (merge listing { active: false })
    )
    
    ;; Log the transaction
    (log-transaction 
      property-id 
      (get seller listing) 
      tx-sender 
      total-cost 
      (get token-amount listing) 
      "TRANSFER"
    )
    
    (ok true)
  )
)

;; Cancel a token listing
(define-public (cancel-token-listing (listing-id uint))
  (let ((listing (unwrap! (map-get? token-listings listing-id) err-listing-not-found)))
    (asserts! (is-eq tx-sender (get seller listing)) err-unauthorized)
    (asserts! (get active listing) err-listing-not-found)
    
    (map-set token-listings listing-id 
      (merge listing { active: false })
    )
    
    (ok true)
  )
)

;; Transfer tokens to another user
(define-public (transfer-tokens (property-id uint) (token-amount uint) (recipient principal))
  (let (
    (sender-ownership (unwrap! (map-get? token-ownership 
                                { property-id: property-id, owner: tx-sender }) 
                      err-not-token-owner))
  )
    (asserts! (not (var-get contract-paused)) err-unauthorized)
    (asserts! (>= (get token-count sender-ownership) token-amount) err-insufficient-tokens)
    (asserts! (> token-amount u0) err-invalid-token-amount)
    (asserts! (not (is-eq tx-sender recipient)) err-unauthorized)
    
    ;; Update sender's token ownership
    (map-set token-ownership 
      { property-id: property-id, owner: tx-sender }
      { token-count: (- (get token-count sender-ownership) token-amount) }
    )
    
    ;; Update recipient's token ownership
    (let ((recipient-ownership (default-to { token-count: u0 } 
                                (map-get? token-ownership { property-id: property-id, owner: recipient }))))
      (map-set token-ownership 
        { property-id: property-id, owner: recipient }
        { token-count: (+ (get token-count recipient-ownership) token-amount) }
      )
    )
    
    ;; Log the transaction
    (log-transaction property-id tx-sender recipient u0 token-amount "TRANSFER")
    
    (ok true)
  )
)


;; Contract administration functions

;; Pause/Unpause the contract
(define-public (set-contract-pause (paused bool))
  (begin
    (asserts! (is-contract-owner) err-owner-only)
    (var-set contract-paused paused)
    (ok true)
  )
)

;; Withdraw platform fees
(define-public (withdraw-platform-fees (amount uint))
  (begin
    (asserts! (is-contract-owner) err-owner-only)
    (asserts! (<= amount (var-get platform-revenue)) err-insufficient-tokens)
    (try! (as-contract (stx-transfer? amount contract-owner tx-sender)))
    (var-set platform-revenue (- (var-get platform-revenue) amount))
    (ok true)
  )
)


;; Read-only functions

;; Get property details
(define-read-only (get-property (property-id uint))
  (map-get? properties property-id)
)

;; Get token details for a property
(define-read-only (get-property-tokens (property-id uint))
  (map-get? property-tokens property-id)
)

;; Get user's token ownership for a property
(define-read-only (get-token-balance (property-id uint) (owner principal))
  (default-to { token-count: u0 } 
    (map-get? token-ownership { property-id: property-id, owner: owner })
  )
)

;; Get listing details
(define-read-only (get-token-listing (listing-id uint))
  (map-get? token-listings listing-id)
)

;; Get transaction details
(define-read-only (get-transaction (transaction-id uint))
  (map-get? property-transactions transaction-id)
)

;; Get all properties owned by a user
(define-read-only (get-user-properties (user principal))
  (default-to { owned-properties: (list) } (map-get? user-properties user))
)

;; Get contract statistics
(define-read-only (get-contract-stats)
  {
    total-properties: (var-get total-properties),
    total-listings: (var-get total-listings),
    total-transactions: (var-get total-transactions),
    platform-revenue: (var-get platform-revenue),
    contract-paused: (var-get contract-paused)
  }
)

