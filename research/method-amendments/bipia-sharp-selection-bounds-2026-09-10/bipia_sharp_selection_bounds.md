# P26-002 BIPIA sharp selection bounds

Date: 2026-09-10  
Status: retrospective pre-execution partial-identification analysis; no outcomes

## Question

How much uncertainty remains when a confirmatory frame retains 181 of the 200 pinned BIPIA cases and the 19 excluded construct cases have no outcomes?

## Sharp finite-frame bounds

Let `m181` be a bounded outcome mean among the selected 181 cases. With no assumption about the 19 excluded cases, the full-pool mean lies in `[181*m181/200, (181*m181+19)/200]`. The interval width is therefore **9.5%**. For a paired contrast bounded in [-1, 1], the corresponding interval width is **19.0%**.

These bounds are sharp: every value in the interval can be attained by assigning admissible outcomes to the excluded cases. They are conditional formulas, not confidence intervals, and they do not require observed trial outcomes.

## Source-specific consequences

The current frame observes all 50 EmailQA cases but only 31 of 50 CodeQA cases. Consequently, a bounded CodeQA mean has interval width **38.0%**, and a CodeQA paired contrast has width **76.0%**. Moving construct acceptances between EmailQA and CodeQA trades uncertainty between the two sources. The best balance occurs at 40 or 41 selected CodeQA cases, but the larger source-specific mean width is still **20.0%** and the paired-contrast width is still **40.0%**.

Source balancing therefore reduces the largest source-specific ignorance region from 38% to 20%, but cannot identify a source-level effect. The prior composition bounds and these selection bounds address different mechanisms: composition changes the weights of observed sources, while selection leaves outcomes missing within a source.

## Safety interpretation

Even if the selected 181 cases produced zero false rejections, the full 200-row finite pool could contain 19 failures, for a worst-case empirical rate of **9.5%**. The worst-case full-pool rate ranges from 9.5% to 11.5% over the 0 through 4 selected failures allowed by the pooled planning gate. To guarantee an empirical full-pool rate no greater than 5% with zero selected failures, at least **9 of the 19** excluded cases would have to be resolved as non-failures; more are required when selected failures occur.

This finite-frame statement is not a replacement for the registered exact upper confidence bound. It shows that the pooled 181-case safety result cannot be transported to the full pool under unrestricted missing outcomes.

## Decision-safe contract

1. Label any 181-case claim as applying to that selected finite frame.
2. Report the 200-row full-pool partial-identification interval when excluded outcomes remain unavailable.
3. Report EmailQA and CodeQA bounds separately; do not substitute source balance for missing-outcome assumptions.
4. Do not call the 181-case safety gate evidence for the full source pool without a declared missingness restriction.

## Boundary

No missing outcome was imputed, no construct was approved, and no target was executed. The bounds do not assess comparator accuracy, semantic validity, or exchangeability. `mainTrialAllowed=false`, `releaseAllowed=false`, and `submissionAllowed=false` remain unchanged.
