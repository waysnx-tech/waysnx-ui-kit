# Governance

Maintainership, decision-making, contribution process, release governance, and repository operations for WaysNX UI Kit.

## Maintainership

WaysNX UI Kit is maintained by the WaysNX Technologies team and a community of trusted contributors.

Maintainers are responsible for:

- Code review and pull request approval/merging
- Release coordination and versioning
- Security vulnerability assessment and response
- Architectural decisions and API governance
- Breaking-change evaluation and mitigation
- Documentation accuracy and completeness
- Repository health and CI/CD maintenance
- Community engagement and contributor support

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contributor guidelines covering:

- Types of contributions
- Repository setup
- Making changes
- Component standards
- Security considerations
- Testing and validation
- Documentation requirements
- Pull request process
- Commit messages
- Code review expectations

## Versioning

WaysNX UI Kit follows semantic versioning.

### Version 1.0.0

WaysNX UI Kit's initial public release is version `1.0.0`.

All 18 focused libraries (`@waysnx/ui-*` packages) and the aggregate `@waysnx/ui-kit` package are released together at `1.0.0` and move forward together in version alignment.

### Semantic Versioning (After 1.0.0)

After the initial `1.0.0` release, package versions follow semantic versioning:

- **MAJOR** (x.0.0): Breaking changes to public APIs, component props, event contracts, or documented behavior
- **MINOR** (1.x.0): Backward-compatible new features and functionality
- **PATCH** (1.0.x): Bug fixes, security updates, and internal improvements without public API changes

### Breaking Changes

A change is considered breaking when it modifies or removes:

- Public exports or named exports
- Component props, events, or prop types
- Hook signatures or behavior
- CSS class names or selectors relied upon by consumers
- Design token contracts
- Required peer dependencies
- Documented runtime behavior
- Type definitions consumers depend on

Breaking changes are discouraged and require:

1. **Justification**: Clear explanation of why the change is necessary
2. **Evaluation**: Assessment of impact on consumers and migration difficulty
3. **Coordination**: Alignment across affected packages
4. **Documentation**: Detailed migration guide with before/after examples
5. **Notice**: Advance notice period before release to allow consumers to adapt

## Release Criteria and Process

### Release Criteria

A release must meet all of the following criteria:

- ✅ All automated CI checks passing: validate, build, P0 regression (Chromium/Firefox/WebKit), security
- ✅ Security review complete for any security-sensitive changes
- ✅ Documentation updated (README, CHANGELOG, migration guides if applicable)
- ✅ CHANGELOG.md entry with clear description of changes
- ✅ Package metadata validation passing (package.json, exports, naming)
- ✅ Manual testing of representative use cases and affected components
- ✅ Approval from maintainers
- ✅ Breaking changes clearly documented with migration path if applicable

### Release Process

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for the detailed step-by-step release process.

The release process includes:

- Version bumping across aligned packages
- CHANGELOG generation and review
- Build and artifact generation
- Package publishing
- Release notes and documentation
- Post-release monitoring

## Security

See [SECURITY.md](SECURITY.md) for:

- Security vulnerability reporting
- Supported versions and security support timeline
- Security-sensitive components and best practices
- Dependency security
- Supply-chain security
- Responsible disclosure policy

## Architectural Decisions

Significant architectural decisions affecting multiple packages, public APIs, or repository structure should be documented in [decisions/](decisions/) using ADR (Architecture Decision Record) format.

Examples of decisions warranting an ADR:

- New package creation or removal
- Major API changes across multiple packages
- Dependency changes affecting public API
- Build or publishing process changes
- Governance policy changes
- Testing strategy changes
- Breaking changes to design tokens or CSS contracts

ADRs provide:

- Context and problem statement
- Decision and justification
- Alternatives considered
- Consequences and trade-offs
- Implementation timeline

## Code Review

Pull requests are reviewed for:

- **Correctness**: Implementation matches intent and produces correct results
- **Architecture**: Alignment with existing patterns and design
- **API consistency**: Props, events, types follow established conventions
- **Accessibility**: Keyboard navigation, ARIA semantics, screen reader support
- **Security**: No introduction of vulnerabilities or unsafe practices
- **Performance**: No regressions or unnecessary inefficiencies
- **Testing**: Appropriate test coverage for the change
- **Documentation**: Clear explanation of public API changes
- **Package boundaries**: Changes don't violate package responsibilities
- **Backward compatibility**: Breaking changes are intentional and documented

Reviews are collaborative and constructive. Focus is on the code and change, not the contributor.

## Continuous Integration

The repository enforces automated validation through GitHub Actions.

All pull requests and pushes to `main` must pass:

- **validate**: Workspace integrity and dependency checks
- **build**: Build and type checking
- **p0-regression**: P0 regression tests on Chromium, Firefox, and WebKit
- **security**: Dependency audit and credential scanning

See [.github/workflows/ci.yml](.github/workflows/ci.yml) and [docs/release/CI_VALIDATION.md](docs/release/CI_VALIDATION.md) for details on CI validation gates.

### P0 Regression Gate

The P0 regression test suite validates critical security and functionality contracts:

- Markdown sanitization (XSS prevention)
- HTML content safety
- IFrame sandbox restrictions
- QR code generation authenticity
- OCR output honesty
- Cropper coordinate reporting
- PDFViewer shell behavior
- Map adapter requirement
- Component layout and rendering

P0 tests must pass on all three browsers (Chromium, Firefox, WebKit) before any change merges.

## Branch Protection Policy

The `main` branch is protected to maintain stability and enforce governance.

**Required configuration** (configured in GitHub Settings):

- Pull requests required for all changes
- All status checks must pass before merge
- One approval required from code owners
- Stale pull request approvals dismissed on new commits
- Branches must be up to date before merge
- Force pushes prohibited
- Branch deletion prevented
- Administrators follow the same rules

This policy is not configured in the repository; it is configured manually in GitHub repository settings.

## Dependency Management

Dependencies are managed through `pnpm` and `pnpm-lock.yaml`.

### Dependency Review

Dependency updates are reviewed for:

- Security vulnerabilities and patches
- Compatibility impact on consumers
- Transitive dependency changes
- Version consistency across the workspace
- License compatibility
- Build and publishing impact

### Peer Dependencies

Packages specify peer dependencies to clarify version requirements without forcing installation.

Consumers are responsible for installing compatible versions of peer dependencies.

### Development Dependencies

Development dependencies should not be exposed in published packages.

Build configuration and tooling may use development dependencies freely.

## Contact and Questions

For governance questions or maintainer coordination, contact the WaysNX team through official WaysNX Technologies channels.

For security vulnerabilities, see [SECURITY.md](SECURITY.md) and use private vulnerability reporting.

For contribution questions, see [CONTRIBUTING.md](CONTRIBUTING.md).
