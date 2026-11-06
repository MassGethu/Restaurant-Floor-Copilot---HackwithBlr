# Live integration failures and fixes

These failures occurred during actual-service verification on 7 November 2026 IST. They are preserved separately from the final passing report.

1. Hindsight retain/recall succeeded, but the first Groq request used a duplicated `/openai/v1` path and returned HTTP 404. The adapter now normalizes the configured Groq URL for the official SDK.
2. A later partial run recorded one successful pair and then failed. Its available report is archived as a `hindsight-memory-attempt-*.json` file. No unrecorded error cause is asserted. SDK transient retries are now bounded at two.
3. A full run passed five pairs, the quiet control, persistence, recovery and handover, but its supersession check failed. The model misread a retrieved environment update that explicitly retired the old preference. That report is archived. Environment updates alone can no longer authorize alternate seating: a departure needs cited evidence rooted in an active manager correction. The reasoning instructions also clarify withdrawal semantics.
4. The final full run passed all eleven defined checks. Earlier failures remain in the artifacts; the 5/5 figure refers specifically to the final repeated synthetic scenario, not all development attempts or general accuracy.

5. The connected browser exposed historical table-hold snapshots being treated as current. Extraction missions now emphasize durable reasons and outcomes; the reasoner explicitly uses current candidates for eligibility. Versioned source re-delivery invalidates old advice. A final expanded live evaluation includes a deliberately historical occupied-table snapshot and passes all twelve checks. The connected browser then correctly selected T3 despite old holds in retrieved history.

A smoke invocation also ran before backend startup completed and failed to connect. It was rerun after the readiness check; the final actual-model regression passed.
