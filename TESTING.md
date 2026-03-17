## Testing overview

This project uses **Jest** and **React Testing Library** to test core booking logic and key UI flows.

- **Test runner**: Jest (`jest`, `jest-environment-jsdom`, `next/jest`)
- **React component testing**: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`

### How to run tests

- **Run all tests**

```bash
npm test
```

- **Watch mode**

```bash
npm run test:watch
```

- **Coverage**

```bash
npm run test:coverage
```

### Test structure

All tests live under the `__tests__` folder:

- `__tests__/lib/booking-rules.test.ts`
  - Pure unit tests for booking rules:
    - Meetings must end by 17:00.
    - Valid last start times for 30/60/90/120 minute meetings.
    - Interval-overlap logic used for conflict detection (no double-booking).

- `__tests__/components/AddTaskModal.test.tsx`
  - Component tests for the admin/guest meeting form:
    - Shows **“New Meeting”** vs **“Edit Meeting”** titles correctly.
    - Name field validation (inline error, no submission when empty).
    - In edit mode, conflict warning is hidden and submit is allowed.
    - Time dropdown marks conflicting slots (e.g. 10:00 / 10:30) as **disabled** when they overlap existing meetings.
    - Close button calls `onClose`.

- `__tests__/components/GuestDashboard.test.tsx`
  - Component tests for the guest dashboard:
    - Renders **“Your meetings”** header and **“Log out”** button.
    - Handles loading (`useQuery` `isLoading`) and error states.
    - Enforces **limit of 3 meetings per guest**:
      - `+ Add meeting` enabled when < 3 meetings.
      - Disabled at 3 meetings and shows *“You can schedule up to 3 meetings.”*.

### Mocks and configuration

- **Jest config**: `jest.config.ts`
  - Uses `next/jest` so Jest understands Next.js (TS, JSX, CSS, env).
  - `testEnvironment: "jsdom"` for DOM-based component tests.
  - `setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"]`.

- **Global setup**: `jest.setup.ts`
  - Imports `@testing-library/jest-dom`.
  - Mocks `@/lib/db` (InstantDB client) to:
    - Provide fake `db.useUser`, `db.useQuery`, `db.auth.*`.
    - Expose a chainable `db.tx.meetings[id].create/update/delete` used by components.
  - Mocks `@instantdb/react` `id()` and `init()` so tests do not talk to the real backend.

> Note: Component tests override `db.useUser` / `db.useQuery` per test when they need specific meeting data.

### Adding new tests (recommended workflow)

1. **For new business rules** (e.g. new booking constraints):
   - Start with a **pure function** in a new or existing test file under `__tests__/lib/`.
   - Write tests that describe the rule in plain language (e.g. “does not allow bookings more than 30 days in advance”).

2. **For new UI behavior**:
   - Add or extend tests under `__tests__/components/`.
   - Use React Testing Library:
     - Find elements by role / text (`getByRole`, `getByText`, `getByLabelText`).
     - Interact with `userEvent` (clicks, typing, etc.).
   - Mock any required data via `db.useQuery` / `db.useUser` before rendering.

3. **For larger flows or drag-and-drop behavior (future work)**:
   - Consider adding Playwright or Cypress E2E tests to cover:
     - Admin drag-and-drop between slots.
     - Guest login → create meeting → see it in the grid.

