import { useDatabase } from "./hooks/useDatabase";

function App() {
  const database = useDatabase();

  const createNote = async () => {
    const note = await database.notes.create({
      title: "Test",
      content: "RxDB works",
    });

    console.log(note);
  };

  return <button onClick={createNote}>Create test note</button>;
}

export default App;
