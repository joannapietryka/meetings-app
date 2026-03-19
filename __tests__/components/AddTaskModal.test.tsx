/**
 * AddTaskModal component tests.
 * InstantDB is mocked in jest.setup; this component receives existingTasks via props.
 */

import React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AddTaskModal } from "@/components/calendar/AddTaskModal"
import type { Task } from "@/lib/calendar-types"

type AddTaskModalProps = React.ComponentProps<typeof AddTaskModal>

function formatLocalYYYYMMDD(d: Date) {
  // sv-SE gives YYYY-MM-DD
  return d.toLocaleDateString("sv-SE")
}

function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function isWeekend(d: Date) {
  const day = d.getDay()
  return day === 0 || day === 6
}

function nextWeekdayStr(from: Date, daysAhead: number) {
  let d = addDays(from, daysAhead)
  while (isWeekend(d)) d = addDays(d, 1)
  return formatLocalYYYYMMDD(d)
}

const TEST_DATE = nextWeekdayStr(new Date(), 1) // tomorrow weekday

const defaultProps: AddTaskModalProps = {
  defaultDate: TEST_DATE,
  existingTasks: [] as Task[],
  onClose: jest.fn(),
  onAdd: jest.fn(),
}

function renderModal(overrides: Partial<AddTaskModalProps> = {}) {
  return render(<AddTaskModal {...defaultProps} {...overrides} />)
}

describe("AddTaskModal", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("title and mode", () => {
    it("shows 'New Meeting' when creating (no initialTitle)", () => {
      renderModal()
      expect(screen.getByRole("heading", { name: /new meeting/i })).toBeInTheDocument()
    })

    it("shows 'Edit Meeting' when initialTitle is provided", () => {
      renderModal({ initialTitle: "Existing Meeting" })
      expect(screen.getByRole("heading", { name: /edit meeting/i })).toBeInTheDocument()
    })
  })

  describe("name validation", () => {
    it("does not call onAdd when name is empty and form is submitted", async () => {
      const onAdd = jest.fn()
      renderModal({ onAdd })
      const submit = screen.getByRole("button", { name: /add meeting/i })
      await userEvent.click(submit)
      expect(onAdd).not.toHaveBeenCalled()
    })

    it("shows inline error when name is empty and form is submitted", async () => {
      renderModal()
      const submit = screen.getByRole("button", { name: /add meeting/i })
      await userEvent.click(submit)
      expect(screen.getByText(/please enter the guest name/i)).toBeInTheDocument()
    })
  })

  describe("conflict and edit mode", () => {
    it("does not show conflict warning when editing (initialTitle set)", () => {
      const existingTasks: Task[] = [
        {
          id: "1",
          title: "My Meeting",
          category: "bed1",
          date: TEST_DATE,
          time: "10:00",
          duration: 60,
        },
      ]
      renderModal({
        defaultDate: TEST_DATE,
        existingTasks,
        initialTitle: "My Meeting",
        initialDescription: "",
        initialCategory: "bed1",
      })
      expect(screen.queryByText(/this time slot conflicts/i)).not.toBeInTheDocument()
    })

    it("submit is not disabled by conflict when editing", () => {
      const existingTasks: Task[] = [
        {
          id: "1",
          title: "My Meeting",
          category: "bed1",
          date: TEST_DATE,
          time: "10:00",
          duration: 60,
        },
      ]
      renderModal({
        defaultDate: TEST_DATE,
        existingTasks,
        initialTitle: "My Meeting",
      })
      const submit = screen.getByRole("button", { name: /save changes/i })
      expect(submit).not.toBeDisabled()
    })
  })

  describe("time options", () => {
    it("marks slots overlapping existing meeting as booked in time dropdown", () => {
      const existingTasks: Task[] = [
        {
          id: "1",
          title: "Booked",
          category: "bed1",
          date: TEST_DATE,
          time: "10:00",
          duration: 60,
        },
      ]
      // Provide defaultTime to prevent the component's "prefill first available date+time"
      // effect from changing the selected date during this test.
      renderModal({ defaultDate: TEST_DATE, defaultTime: "10:00", existingTasks })
      const comboboxes = screen.getAllByRole("combobox")
      const timeSelect = comboboxes[1] as HTMLSelectElement
      const options = within(timeSelect).getAllByRole("option")
      const tenOClock = options.find((o) => (o as HTMLOptionElement).value === "10:00")
      const tenThirty = options.find((o) => (o as HTMLOptionElement).value === "10:30")
      expect(tenOClock).toBeDisabled()
      expect(tenThirty).toBeDisabled()
    })
  })

  describe("close", () => {
    it("calls onClose when close button is clicked", async () => {
      const onClose = jest.fn()
      renderModal({ onClose })
      const closeButton = screen.getByRole("button", { name: /close/i })
      await userEvent.click(closeButton)
      expect(onClose).toHaveBeenCalled()
    })
  })
})
