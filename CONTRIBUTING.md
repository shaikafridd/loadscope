# Contributing to LoadScope

Thank you for your interest in contributing to **LoadScope**! We welcome community contributions, bug reports, feature suggestions, and documentation improvements.

---

## 🛠️ Development Setup

LoadScope requires **Node.js >= 20.0.0**.

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/shaikafridd/loadscope.git
   cd loadscope
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build TypeScript bundles:**
   ```bash
   npm run build
   ```

4. **Run the test suite:**
   ```bash
   npm test
   ```

5. **Start local mock test server:**
   ```bash
   npm run test-server
   ```

---

## 🧪 Testing Guidelines

We use [Vitest](https://vitest.dev/) for unit and integration testing.

- Ensure all existing and new tests pass:
  ```bash
  npm test
  ```
- Vitest is configured with `fileParallelism: false` to ensure deterministic execution and prevent shared CPU contention on virtualized CI runners.
- When adding performance assertions, account for virtualization timer jitter (e.g., assert reasonable minimum thresholds rather than brittle sub-millisecond exactness).

---

## 📜 Pull Request Guidelines

1. **Branch Naming**: Use feature-specific semantic branch names:
   - `feat/feature-name`
   - `fix/bug-fix`
   - `docs/doc-updates`
2. **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add distributed worker coordination`
   - `fix(ci): prevent socket hang on keep-alive connections`
   - `docs: update breaking-point CLI examples`
3. **No Binary Artifacts**: Never commit `.pdf` files or generated test artifacts. Verify `.gitignore` rules before staging.
4. **Code Quality**: Verify build compilation (`npm run build`) and test execution (`npm test`) before opening a PR.

---

## ⚖️ License

By contributing to LoadScope, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
