import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Note, NoteSchema } from './note.schema';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.DATABASE_URL!),
    MongooseModule.forFeature([{ name: Note.name, schema: NoteSchema }]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
