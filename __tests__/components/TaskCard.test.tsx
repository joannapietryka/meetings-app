import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TaskCard } from "@/components/calendar/TaskCard"
import type { Task } from "@/lib/calendar-types"

describe("TaskCard", () => {
  const task: Task = {
    id: "t1",
    title: "Test meeting",
    category: "bed1",
    date: "2026-03-17",
    time: "10:00",
    duration: 30,
  }

  it("clicking delete icon does not trigger edit click", async () => {
    const onClickTask = jest.fn()
    const onDelete = jest.fn()
    render(
      <TaskCard
        task={task}
        onDragStart={jest.fn()}
        onDelete={onDelete}
        onClickTask={onClickTask}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: /delete meeting/i }))
    expect(onClickTask).not.toHaveBeenCalled()
  })

  it("shows confirmation and deletes only on Yes", async () => {
    const onDelete = jest.fn()
    const onClickTask = jest.fn()
    render(
      <TaskCard
        task={task}
        onDragStart={jest.fn()}
        onDelete={onDelete}
        onClickTask={onClickTask}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: /delete meeting/i }))
    expect(screen.getByText(/are you sure you want to delete this meeting/i)).toBeInTheDocument()

    // Outside click closes tooltip without deleting or opening edit
    await userEvent.click(document.body)
    expect(screen.queryByText(/are you sure you want to delete this meeting/i)).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
    expect(onClickTask).not.toHaveBeenCalled()

    // Re-open tooltip and cancel via "No"
    await userEvent.click(screen.getByRole("button", { name: /delete meeting/i }))
    expect(screen.getByText(/are you sure you want to delete this meeting/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /^no$/i }))
    expect(onDelete).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: /delete meeting/i }))
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }))
    expect(onDelete).toHaveBeenCalledWith("t1")
  })
})

