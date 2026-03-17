import "@testing-library/jest-dom"

// Build a chainable mock for db.tx.meetings[id].update / .create / .delete
const createTxMeeting = () => ({
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
})
const txMeetings = new Proxy({} as Record<string, ReturnType<typeof createTxMeeting>>, {
  get(_, id: string) {
    if (!(id in _)) ( _ as any)[id] = createTxMeeting()
    return ( _ as any)[id]
  },
})

jest.mock("@/lib/db", () => ({
  db: {
    useUser: jest.fn(() => ({ id: "test-user-id", email: "guest@test.com" })),
    useQuery: jest.fn(() => ({
      isLoading: false,
      error: null,
      data: { meetings: [] },
    })),
    auth: {
      signOut: jest.fn(),
      sendMagicCode: jest.fn(),
      signInWithMagicCode: jest.fn(),
    },
    transact: jest.fn((arg: unknown) => Promise.resolve(arg)),
    tx: { meetings: txMeetings },
  },
}))

jest.mock("@instantdb/react", () => ({
  id: jest.fn(() => "mock-meeting-id"),
  init: jest.fn(),
}))
