import { i } from "@instantdb/react"

export default i.schema({
  entities: {
    meetings: i.entity({
      id: i.string(),
      title: i.string(),
      description: i.string().optional(),
      category: i.string(),
      date: i.string(),
      time: i.string().optional(),
      duration: i.number().optional(),
      createdAt: i.string().optional(),
      userId: i.string().optional(),
      userEmail: i.string().optional(),
    }),
  },
  links: {
    // no links yet
  },
})

