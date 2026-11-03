# Streamlined WoSB Crafting Tracker proposal

## What this proposal is based on

The earlier project discussions described a crafting-manager role, named goals and recipients, assigned or open contributors, contribution / claim / deposit tracking, completion reports and discussion threads. They also described recipe dropdown navigation, a return-to-menu action, first-rate ship recipes, and a cannon / weapon quantity calculator. These are historical conversation requirements, not a claim that every old feature was deployed successfully.

The recovered `BOM-Bot-Novonode.zip` is an early TypeScript music-bot package. It does not contain the old Python Crafting Tracker. The current code supplies normalized Wiki records and recipes that can support a replacement. A direct migration of old goal records must wait for the actual old tracker data/schema; this proposal does not invent that schema.

## Recommended member flow

1. Open **Guild Ledger → Crafting** or choose **Crafting Goals** from the Control Desk.
2. View active goals as cards with recipient, recipe, target quantity, verified progress and missing materials.
3. Open a goal to see required / pledged / verified / consumed materials and its history. Pledges never count as deposited resources.
4. Choose **Contribute** and attach an existing verified donation receipt, or submit a new deposit for officer verification. One receipt can be allocated only up to its verified quantity; allocating it does not create another donation.
5. Optionally claim part of a remaining requirement. Claims have a deadline, can be released, and expire without leaving a member stuck in a form.
6. Officers confirm consumption and delivery. Completion removes the goal from the active index, archives its discussion thread, and retains the goal and contributor report permanently.

The default Discord card should have only **View Goal**, **Contribute**, and **Open Dashboard**. Keep edits, discount settings and allocation reconciliation on the dashboard. All member replies are ephemeral; thread creation is optional and explicit.

## Two goal types

| Type | Use | Completion |
|---|---|---|
| One-off craft | A ship, cannon batch, resource batch or named recipient | Close after verified material allocation and officer-confirmed delivery |
| Continuous fund | Recurring guild ship funding, including the Huracan program | Calculate funded units from a permanent contribution ledger; carry excess forward automatically |

For the Huracan fund, keep the earlier preference: no individual “Huracan #N” records and no reset after each funded ship. Historically discussed reference requirements were 3,800 Blueprint Fragments and 9,600 Escudo per funded Huracan. Verify those against the current recipe before activating a fund. If requirements differ by patch or discount, version them rather than rewriting prior contributions.

For requirements `required[item]` and verified totals `total[item]`, funded units are the smallest whole-number quotient across all required items. The next unit's progress for each resource is its unconsumed remainder after deducting the requirements for the funded units. Surplus of a non-limiting resource remains available; it must not be reduced with an independent per-resource modulo, which can discard material that still belongs to future units.

## Recipe and cost rules

- Reuse the same Wiki recipe data and item identity as the Ship Builder and new donation ledger; snapshot the recipe when a goal is created.
- Exclude coin-only, chest-exclusive and other non-craftable ships from craft-goal selectors.
- Show normal resource costs separately from instant-build costs. Missing prices stay “unknown.”
- Offer optional Imperial Contract, Shipbuilders, Unique Charter, Season, Trade Mission and Faction discount toggles. Respect their ship-category eligibility and actual verified percentages. Do not stack discounts by assumption.
- Show the formula, rounding rule, applied discounts, source and recipe revision to officers before creation.
- Treat historical “100 fragments make a blueprint” behavior as a recipe-specific conversion to verify, not a universal rule.

## Officer workspace

A single table should cover active, funded, crafting, delivered, cancelled and archived goals. Filters: recipient, recipe, assignee, due date and missing materials. Add searchable recipes and a quantity calculator; preserve back-navigation in every Discord recipe menu.

Officers can rename a goal, change a recipient, assign contributors, correct a deposit with an explicit reversal, release claims, reconcile allocation errors, and export contributor and material reports. Changes to requirements require a preview of their effect on already-verified progress. Cancelling archives a goal and returns allocations to available stock; it never deletes donations or audit history.

## Proposed records

- `craft_goals`: identity, type, recipient, state, recipe snapshot, quantity, discounts, revision and optional thread.
- `craft_requirements`: item identity and integer required quantities.
- `craft_claims`: member, item, quantity, expiry and released / fulfilled state.
- `craft_allocations`: verified donation reference, item, quantity, goal and reversed-allocation reference.
- `craft_deliveries`: officer, recipient, outcome, time and evidence reference.
- `craft_events`: immutable actions, corrections, before / after values and actor.

Guard allocated quantities and revision updates in a transaction. Keep deposit quantities as exact integers. Import legacy records through a dry-run mapping and reconciliation report, retaining their old IDs and totals rather than silently reshaping them.

## Delivery phases and acceptance

1. Recipe browser / quantity calculator and read-only goal dashboard.
2. Goal creation, claims, receipt allocations and officer verification.
3. Delivery / completion reporting and continuous funds.
4. Legacy migration after the old source and current data are available.

Acceptance tests must demonstrate no duplicate allocation under concurrent officers, no pledge counted as stock, correct discount scope and rounding, recoverable abandoned forms, correct continuous-fund carryover, preserved audit history after corrections, and consistent mobile / Discord totals.

This document is the requested proposal; a crafting tracker is not silently introduced into the current update.
