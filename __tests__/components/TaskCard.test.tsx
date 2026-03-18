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
    render(
      <TaskCard
        task={task}
        onDragStart={jest.fn()}
        onDelete={onDelete}
        onClickTask={jest.fn()}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: /delete meeting/i }))
    expect(screen.getByRole("dialog", { name: /confirm delete meeting/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /^no$/i }))
    expect(onDelete).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: /delete meeting/i }))
    await userEvent.click(screen.getByRole("button", { name: /^yes$/i }))
    expect(onDelete).toHaveBeenCalledWith("t1")
  })
})

