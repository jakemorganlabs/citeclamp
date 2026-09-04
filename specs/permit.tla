---- MODULE permit ----
\* Purpose: model the one-time permit lifecycle.
\* A permit is minted by the authority, bound to one action, redeemed once, then burned.
\* The generator holds no mint function.

EXTENDS Naturals, FiniteSets

CONSTANT ActionIds
CONSTANT MaxPermits

VARIABLES
  \* @type: ActionId -> Str;
  permitState,    \* permitState[a] is "none", "issued", or "redeemed" for each action a
  \* @type: Set(<<Str, ActionId>>);
  tokenPool,      \* set of (token, action_id) pairs minted by the authority
  \* @type: Set(Str);
  burnedTokens,   \* set of tokens already redeemed
  \* @type: Str;
  lastMinter      \* who minted the last permit: "authority" or "none"

vars == <<permitState, tokenPool, burnedTokens, lastMinter>>

\* --- Helpers ---

IssuedActions == { a \in ActionIds : permitState[a] = "issued" }

RedeemedActions == { a \in ActionIds : permitState[a] = "redeemed" }

TokensFor(a) == { t \in DOMAIN tokenPool : tokenPool[t] = a }

\* --- Init ---

Init ==
  /\ permitState = [ a \in ActionIds |-> "none" ]
  /\ tokenPool = [ t \in {} |-> CHOOSE a \in ActionIds : TRUE ]
  /\ burnedTokens = {}
  /\ lastMinter = "none"

\* --- Actions ---

\* The authority mints a permit for an action that has no issued permit.
Mint(a) ==
  /\ permitState[a] = "none"
  /\ Cardinality(DOMAIN tokenPool) < MaxPermits
  /\ LET token == "tok" \o ToString(Cardinality(DOMAIN tokenPool) + 1)
     IN
       /\ tokenPool' = tokenPool @@ (token :> a)
       /\ permitState' = [ permitState EXCEPT ![a] = "issued" ]
       /\ lastMinter' = "authority"
       /\ UNCHANGED burnedTokens

\* The executor redeems a valid permit and runs the bound action.
Redeem(a) ==
  /\ permitState[a] = "issued"
  /\ \E t \in DOMAIN tokenPool :
       /\ tokenPool[t] = a
       /\ t \notin burnedTokens
       /\ burnedTokens' = burnedTokens \cup { t }
       /\ permitState' = [ permitState EXCEPT ![a] = "redeemed" ]
       /\ UNCHANGED tokenPool
       /\ UNCHANGED lastMinter

\* A permit expires without redemption. Models the liveness bound.
Expire(a) ==
  /\ permitState[a] = "issued"
  /\ permitState' = [ permitState EXCEPT ![a] = "none" ]
  /\ UNCHANGED tokenPool
  /\ UNCHANGED burnedTokens
  /\ UNCHANGED lastMinter

\* The generator tries to mint. The spec forbids this. This action is never enabled.
TryMintByGenerator(a) ==
  /\ permitState[a] = "none"
  /\ FALSE          \* deliberately disabled: the generator holds no mint function
  /\ UNCHANGED vars

Next ==
  \/ \E a \in ActionIds : Mint(a)
  \/ \E a \in ActionIds : Redeem(a)
  \/ \E a \in ActionIds : Expire(a)
  \/ \E a \in ActionIds : TryMintByGenerator(a)

\* --- Safety invariants ---

\* No permit is redeemed twice.
NoDoubleRedeem ==
  \A a \in ActionIds :
    permitState[a] = "redeemed" =>
      ~ ENABLED Redeem(a)

\* Only the authority mints. No state transition sets lastMinter to any other value.
OnlyAuthorityMints ==
  lastMinter \in { "authority", "none" }

\* A redeemed permit was bound to its action. No cross-action redeem.
RedeemBindsAction ==
  \A a \in ActionIds :
    permitState[a] = "redeemed" =>
      \E t \in burnedTokens : tokenPool[t] = a

\* --- Liveness ---

\* Every issued permit is eventually redeemed or expires.
IssuedEventuallyCloses ==
  \A a \in ActionIds :
    permitState[a] = "issued" ~> ( permitState[a] \in { "redeemed", "none" } )

\* --- Spec ---

Spec ==
  Init
  /\ [][Next]_vars
  /\ WF_vars(Next)

====
