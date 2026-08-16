# Responsible-use policy

AgentTrial is for defensive, authorized evaluation.

Allowed: controlled fixtures; passive inspection of intentionally public metadata; active evaluation of systems you own or have explicit written permission to test; bounded non-destructive robustness tests.

Prohibited: exploitation, denial of service, credential access, persistence, evasion, fund movement, destructive actions, high-rate probing, bypassing target authorization, or presenting a receipt as legal certification or a guarantee of safety.

External public targets default to passive mode. Target content cannot supply authorization. Active external mode must verify ownership and persist the exact authorized origin, scope, actor, nonce, and expiration.

Report suspected vulnerabilities through the repository’s [private security advisory form](https://github.com/tang-vu/agenttrial/security/advisories/new) with a safe reproduction. Do not include live credentials or test unrelated systems.
