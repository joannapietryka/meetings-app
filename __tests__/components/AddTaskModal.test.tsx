/**
 * AddTaskModal component tests.
 * InstantDB is mocked in jest.setup; this component receives existingTasks via props.
 */

import React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AddTaskModal } from "@/components/calendar/AddTaskModal"
import type { Task } from "@/lib/calendar-types"
import { DAY_SLOTS } from "@/lib/calendar-types"

type AddTaskModalProps = React.ComponentProps<typeof AddTaskModal>

function formatLocalYYYYMMDD(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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
    it("shows new-booking heading when creating (no editingTaskId)", () => {
      renderModal()
      expect(screen.getByRole("heading", { name: /nowa wizyta/i })).toBeInTheDocument()
    })

    it("shows edit heading when editingTaskId is set", () => {
      renderModal({
        editingTaskId: "meeting-1",
        initialTitle: "Existing Meeting",
      })
      expect(screen.getByRole("heading", { name: /edytuj wizytę/i })).toBeInTheDocument()
    })

    it("prefills name from prefillTitle without entering edit mode", () => {
      renderModal({ prefillTitle: "Jan Kowalski" })
      expect(screen.getByRole("heading", { name: /nowa wizyta/i })).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/anna kowalska/i)).toHaveValue("Jan Kowalski")
    })
  })

  describe("name validation", () => {
    it("does not call onAdd when name is empty and form is submitted", async () => {
      const onAdd = jest.fn()
      renderModal({ onAdd })
      const submit = screen.getByRole("button", { name: /rezerwuj wizytę/i })
      await userEvent.click(submit)
      expect(onAdd).not.toHaveBeenCalled()
    })

    it("shows inline error when name is empty and form is submitted", async () => {
      renderModal()
      const submit = screen.getByRole("button", { name: /rezerwuj wizytę/i })
      await userEvent.click(submit)
      expect(screen.getByText(/proszę wpisać imię i nazwisko pacjenta/i)).toBeInTheDocument()
    })
  })

  describe("conflict and edit mode", () => {
    it("does not show conflict warning when editing", () => {
      const dayOfWeek = new Date(TEST_DATE).getDay()
      const firstSlot = (DAY_SLOTS[dayOfWeek] ?? [])[0] ?? "09:00"
      const existingTasks: Task[] = [
        {
          id: "1",
          title: "My Meeting",
          category: "online",
          date: TEST_DATE,
          time: firstSlot,
          duration: 50,
        },
      ]
      renderModal({
        defaultDate: TEST_DATE,
        existingTasks,
        editingTaskId: "1",
        initialTitle: "My Meeting",
        initialDescription: "",
        initialCategory: "online",
      })
      expect(screen.queryByText(/ten termin jest już zarezerwowany/i)).not.toBeInTheDocument()
    })

    it("submit is not disabled by conflict when editing", () => {
      const dayOfWeek = new Date(TEST_DATE).getDay()
      const firstSlot = (DAY_SLOTS[dayOfWeek] ?? [])[0] ?? "09:00"
      const existingTasks: Task[] = [
        {
          id: "1",
          title: "Moja wizyta",
          category: "online",
          date: TEST_DATE,
          time: firstSlot,
          duration: 50,
        },
      ]
      renderModal({
        defaultDate: TEST_DATE,
        existingTasks,
        editingTaskId: "1",
        initialTitle: "Moja wizyta",
      })
      const submit = screen.getByRole("button", { name: /zapisz zmiany/i })
      expect(submit).not.toBeDisabled()
    })
  })

  describe("time options", () => {
    it("marks booked slots as unavailable in the time dropdown", () => {
      const dayOfWeek = new Date(TEST_DATE).getDay()
      const daySlots = DAY_SLOTS[dayOfWeek] ?? []
      if (daySlots.length === 0) return // skip if this weekday has no slots

      const bookedSlot = daySlots[0]
      const existingTasks: Task[] = [
        {
          id: "1",
          title: "Booked",
          category: "online",
          date: TEST_DATE,
          time: bookedSlot,
          duration: 50,
        },
      ]
      renderModal({ defaultDate: TEST_DATE, defaultTime: bookedSlot, existingTasks })
      const comboboxes = screen.getAllByRole("combobox")
      const timeSelect = comboboxes[1] as HTMLSelectElement
      const bookedOption = within(timeSelect).getByRole("option", {
        name: new RegExp(`${bookedSlot}.*niedostępny`, "i"),
      }) as HTMLOptionElement
      expect(bookedOption.value).toBe(bookedSlot)
      expect(bookedOption).toBeDisabled()
    })

    it("disables submit when a day has no free slots", () => {
      const dayOfWeek = new Date(TEST_DATE).getDay()
      const daySlots = DAY_SLOTS[dayOfWeek] ?? []
      if (daySlots.length === 0) return

      const existingTasks: Task[] = daySlots.map((slot, index) => ({
        id: `taken-${index}`,
        title: `Taken ${index}`,
        category: "online",
        date: TEST_DATE,
        time: slot,
        duration: 50,
      }))

      renderModal({ defaultDate: TEST_DATE, existingTasks })

      expect(screen.getByRole("button", { name: /rezerwuj wizytę/i })).toBeDisabled()
    })
  })

  describe("close", () => {
    it("keeps the modal open when onAdd rejects the booking", async () => {
      const onAdd = jest.fn().mockResolvedValue(false)
      const onClose = jest.fn()
      renderModal({ onAdd, onClose })

      await userEvent.type(screen.getByPlaceholderText(/anna kowalska/i), "Jan Kowalski")
      await userEvent.click(screen.getByRole("button", { name: /rezerwuj wizytę/i }))

      expect(onAdd).toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole("heading", { name: /nowa wizyta/i })).toBeInTheDocument()
    })

    it("calls onClose when close button is clicked", async () => {
      const onClose = jest.fn()
      renderModal({ onClose })
      const closeButton = screen.getByRole("button", { name: /zamknij/i })
      await userEvent.click(closeButton)
      expect(onClose).toHaveBeenCalled()
    })
  })
})
