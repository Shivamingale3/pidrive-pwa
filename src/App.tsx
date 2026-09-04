import { useState } from "react";

import { useNotes } from "@/hooks/useNotes";

function App() {
  const { notes, create, update, remove } = useNotes();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      return;
    }

    await create({
      title: title.trim(),
      content: content.trim(),
    });

    setTitle("");
    setContent("");
  };

  const handleUpdate = async (id: string) => {
    await update(id, {
      title: "Updated title",
      content: "Updated content",
    });
  };

  const handleDelete = async (id: string) => {
    await remove(id);
  };

  return (
    <div>
      <h1>Notes</h1>

      <div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
        />

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Content"
        />

        <button onClick={handleCreate}>Create</button>
      </div>

      <hr />

      {notes.map((note) => (
        <article key={note.id}>
          <h2>{note.title}</h2>
          <p>{note.content}</p>

          <button onClick={() => handleUpdate(note.id)}>
            Update
          </button>

          <button onClick={() => handleDelete(note.id)}>
            Delete
          </button>
        </article>
      ))}
    </div>
  );
}
export default App;