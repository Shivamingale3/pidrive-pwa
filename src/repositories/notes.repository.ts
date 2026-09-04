import { ulid } from "ulid";

import type { CreateNote, Note, UpdateNote } from "@/types/notes.types";
import type { RxCollection } from "rxdb";
import { map, type Observable } from "rxjs";
export class NoteRepository {
  constructor(private readonly notes: RxCollection<Note>) {}
  async create(data: CreateNote): Promise<Note> {
    const now = new Date().toISOString();

    const note: Note = {
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const document = await this.notes.insert(note);

    return document.toJSON();
  }

  async findById(id: string): Promise<Note | null> {
    const document = await this.notes
      .findOne({
        selector: {
          id,
          deletedAt: null,
        },
      })
      .exec();

    return document?.toJSON() ?? null;
  }

  async findAll(): Promise<Note[]> {
    const documents = await this.notes
      .find({
        selector: {
          deletedAt: null,
        },
      })
      .sort({
        updatedAt: "desc",
      })
      .exec();

    return documents.map((document) => document.toJSON());
  }

  async update(id: string, data: UpdateNote): Promise<Note> {
    const document = await this.notes
      .findOne({
        selector: {
          id,
          deletedAt: null,
        },
      })
      .exec();

    if (!document) {
      throw new Error(`Note not found: ${id}`);
    }

    const updatedDocument = await document.patch({
      ...data,
      updatedAt: new Date().toISOString(),
    });

    return updatedDocument.toJSON();
  }

  async delete(id: string): Promise<void> {
    const document = await this.notes
      .findOne({
        selector: {
          id,
          deletedAt: null,
        },
      })
      .exec();

    if (!document) {
      throw new Error(`Note not found: ${id}`);
    }

    const now = new Date().toISOString();

    await document.patch({
      deletedAt: now,
      updatedAt: now,
    });
  }
  findAll$(): Observable<Note[]> {
    return this.notes
      .find({
        selector: {
          deletedAt: null,
        },
        sort: [
          {
            updatedAt: "desc",
          },
        ],
      })
      .$.pipe(
        map((documents) => documents.map((document) => document.toJSON())),
      );
  }
}
