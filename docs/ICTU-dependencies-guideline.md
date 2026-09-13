## ICTU recommendations for dependency management

Managing and updating dependencies is a crucial part of software development and maintenance. On the one hand, new versions of dependencies offer new and/or improved functionality and fix bugs and security vulnerabilities. On the other hand, new versions carry the risk of introducing new bugs, security vulnerabilities, and supply chain attacks. Consequently, the following recommendations apply to dependency management and updates; deviations are permitted, but only for valid reasons.

These recommendations apply to all dependencies within the software and the CI pipeline: direct and indirect dependencies, including images used in Dockerfiles, Helm charts, pre-commit hooks, and CI pipeline definitions.

### Adding dependencies

Managing and updating a dependency is only necessary if that dependency exists in the first place. The first recommendation therefore concerns the addition of dependencies.

1. Before adding a new dependency, verify that it is actively maintained. Consider factors such as the license, support options, community activity, number of active maintainers, recent releases and release policy (e.g., availability of LTS releases, planned EOL for major releases), commit activity, open security issues, open pull requests, and whether the project has been archived. If a dependency does not appear to be maintained, choose a different dependency, implement the functionality yourself, or copy the dependency's source code into your own repository ("fork") or your software's repository ("vendoring") and maintain it yourself.

### Specifying dependencies

The aim of the recommendations for specifying dependencies is to prevent the unintended and unnoticed installation of dependency versions other than those intended. This reduces vulnerability to supply chain attacks and improves build reproducibility.

2. Do not use unpinned tags: avoid `latest` or any other tags that do not point to a specific version, such as `trixie` or `windows`. Use version tags instead—such as `13.6.0`—or snapshot tags, such as `trixie-20260713`.
3. Pin dependencies with the highest possible precision: use `3.14.5` rather than `3.14` or `3`. Avoid using version ranges (e.g., `requests>=2.34`) unless the software is a library.
4. Pin dependencies using hashes (digests, commit SHAs, integrity hashes) whenever possible. Package managers often handle this automatically via a lockfile. In such cases, place the lockfile under version control and use it to install dependencies without performing updates (e.g., `npm ci` or `uv sync --locked` in build pipelines). For dependencies that do not use a package manager, use a tool like Renovate, Dependabot, or Update-time. Specifying both a version and a hash (e.g., `actions/checkout@3d3c42...ba90b1 # v7.0.1`) may seem like redundant administration; however, the version being used is not easily identifiable from the hash pin alone, and tools can often update both simultaneously.
5. Retrieve dependencies via the project's internal registry or proxy—such as Nexus Repository or Harbor—rather than directly from public registries. Verify the origin of a dependency whenever possible, for instance through signed releases, provenance attestations, or signed images.

### Updating dependencies

The aim of these recommendations for updating dependencies is to mitigate the risks associated with new versions.

6. Observe a cooldown period of at least 7 days before applying a new version. When selecting a longer cooldown period, carefully weigh the reduced risk of supply chain attacks against the increased security risk resulting from delayed receipt of security fixes. You may skip the cooldown (on an exceptional basis) for critical security fixes. Configure the tools used for updates to respect the cooldown period—for example, using `min-release-age` in `.npmrc` or uv's `exclude-newer` in `pyproject.toml`.
7. Before updating to a major release of a dependency, assess the risk associated with the new release. Check whether the new release includes changes that increase the risk of regressions, such as extensive new functionality, backward-incompatible changes, or major refactoring. In such cases, wait for the first or second patch release before updating the version.
8. Use tools to update dependencies periodically (e.g., once per sprint)—for instance, via the package manager, Renovate, Dependabot, or Update-time.
9. Treat a dependency update like any other change: open a merge request, review the new version's release notes or changelog for breaking changes, behavioral changes, and suspicious modifications, and verify that the entire pipeline succeeds. Review changes in transitive dependencies (visible in lockfiles and/or SBoMs) using a risk-based approach: new runtime and build dependencies, new origins, dependency downgrades, license changes, and new known vulnerabilities require explicit attention. Do not merge updates automatically. For major updates, explicitly determine what modifications to your own software are required.

### Monitoring dependencies

Finally, here are recommendations for monitoring dependencies for new risks that emerge or become known after the update.

10. Run the package manager's audit function daily (e.g., `npm audit` or `pip-audit`) or analyze the SBoM daily (e.g., in Dependency-Track) to check dependencies for known vulnerabilities. Do this not only for current dependencies but also for dependencies used in your software's releases—for instance, by analyzing release SBoMs in Dependency-Track. After all, new vulnerabilities are discovered daily, even when your own software remains unchanged. Analyze the severity of the findings and take mitigating measures (e.g., upgrading, downgrading, or replacing dependencies sooner; releasing a patch for your software; notifying the managing party) or explicitly accept the risk.
11. Periodically analyze—for example, once a quarter—whether a dependency is still being maintained. Check the same points as in recommendation 1. If a dependency appears to be no longer maintained, take a mitigating measure (e.g., migrating, vendoring, or building it yourself) or explicitly accept the risk.
