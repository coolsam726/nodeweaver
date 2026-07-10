import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NoteDocument = HydratedDocument<Note>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Note {
  @Prop({ required: true })
  title!: string;
}

export const NoteSchema = SchemaFactory.createForClass(Note);
