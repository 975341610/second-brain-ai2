import asyncio
import os
from unittest.mock import AsyncMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.models.db_models import Note, ModelConfig, Notebook, Base

# Setup a clean test DB
test_db = "test_repro_session.db"
if os.path.exists(test_db): os.remove(test_db)
engine = create_engine(f"sqlite:///{test_db}")
SessionLocal = sessionmaker(bind=engine)
Base.metadata.create_all(engine)

# Create test data in the test DB
db = SessionLocal()
notebook = Notebook(name="Test", icon="T")
db.add(notebook)
db.commit()
note = Note(title="Test Note", content="Test Content", summary="", tags="", notebook_id=notebook.id)
db.add(note)
db.commit()
note_id = note.id
model_config = ModelConfig(provider="openai", api_key="sk-test", base_url="https://api.openai.com/v1", model_name="gpt-3.5-turbo")
db.add(model_config)
db.commit()
db.close()

async def repro():
    # Patch SessionLocal in the routes module to use our test SessionLocal
    with patch("backend.api.routes.SessionLocal", SessionLocal):
        from backend.api.routes import background_index_note
        with patch("backend.api.routes.ai_client") as mock_ai:
            mock_ai.summarize = AsyncMock(return_value="Mocked Summary")
            mock_ai.embed = AsyncMock(return_value=[0.1] * 256)
            
            print(f"Calling background_index_note with note_id={note_id}...")
            try:
                # We need to make sure update_note is also imported or handled
                await background_index_note(
                    note_id=note_id,
                    title="Test Note",
                    content="Test Content",
                    tags=["Tag1"]
                )
                print("Successfully finished background_index_note!")
                
                # Check if session is indeed active and committed
                db = SessionLocal()
                updated_note = db.query(Note).filter_by(id=note_id).first()
                if updated_note.summary == "Mocked Summary":
                    print("✅ Verification Passed: DB was updated correctly in background task.")
                else:
                    print(f"❌ Verification Failed: Summary is '{updated_note.summary}'")
                db.close()
                
            except Exception as e:
                print(f"Caught error: {type(e).__name__}: {str(e)}")
                import traceback
                traceback.print_exc()
            finally:
                if os.path.exists(test_db): os.remove(test_db)

if __name__ == "__main__":
    asyncio.run(repro())
