## Partial identification under construct-based exclusion

The 181-case analysis frame excludes 19 of the 200 pinned BIPIA cases. We did not assume that excluded construct cases were exchangeable with retained cases and did not impute their outcomes. If `m181` denotes a retained-case outcome mean bounded in [0, 1], the full-pool mean is identified only within `[181*m181/200, (181*m181+19)/200]`, an interval 0.095 wide. For a paired contrast bounded in [-1, 1], the analogous interval is 0.190 wide.

The uncertainty is larger within individual sources. In the current frame, 19 of 50 CodeQA cases are excluded, yielding a sharp 0.380-wide interval for a bounded CodeQA mean and a 0.760-wide interval for its paired contrast. Redistributing the 57 retained construct cases can minimize the larger EmailQA or CodeQA mean interval at 0.200, attained when 40 or 41 CodeQA cases are retained, but it cannot eliminate partial identification.

These are finite-frame identification bounds rather than confidence intervals. They isolate uncertainty from missing outcomes and complement the separate sensitivity analysis for changed source weights. Accordingly, pooled results are restricted to the selected 181-case frame unless a missingness assumption is declared and justified.
