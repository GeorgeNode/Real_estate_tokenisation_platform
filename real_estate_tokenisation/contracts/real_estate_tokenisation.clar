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
