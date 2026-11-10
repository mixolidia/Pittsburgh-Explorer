import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  Check,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  MapPin,
  UtensilsCrossed,
} from 'lucide-react';
import {
  createDish,
  getListDishesQueryKey,
  useListDishes,
  type DishPhoto,
} from '@workspace/api-client-react';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1280;
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];

function blobFromCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Your browser could not prepare this photo.'));
        }
      },
      type,
      quality,
    );
  });
}

async function resizeImage(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This photo could not be opened. Try a different image.');
  }

  try {
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Your browser could not prepare this photo.');
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preferredType = file.type;
    let output: Blob | undefined;

    for (const quality of IMAGE_QUALITIES) {
      const candidate = await blobFromCanvas(canvas, preferredType, quality);
      if (candidate.type === preferredType && candidate.size <= MAX_IMAGE_BYTES) {
        output = candidate;
        break;
      }
    }

    if (!output && preferredType === 'image/png') {
      for (const quality of IMAGE_QUALITIES) {
        const candidate = await blobFromCanvas(canvas, 'image/webp', quality);
        if (candidate.type === 'image/webp' && candidate.size <= MAX_IMAGE_BYTES) {
          output = candidate;
          break;
        }
      }
    }

    if (!output) {
      throw new Error(
        'This photo is still too large after resizing. Choose a smaller image.',
      );
    }

    const imageBlob = output;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Your browser could not prepare this photo.'));
        }
      };
      reader.onerror = () =>
        reject(new Error('Your browser could not read this photo.'));
      reader.readAsDataURL(imageBlob);
    });
  } finally {
    bitmap.close();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

function DishCard({ dish }: { dish: DishPhoto }) {
  const date = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dish.createdAt));

  return (
    <article className="dish-card">
      <div className="dish-card-image-wrap">
        <img className="dish-card-image" src={dish.imageUrl} alt={dish.title} />
        <span className="dish-card-date">{date}</span>
      </div>
      <div className="dish-card-copy">
        <h3>{dish.title}</h3>
        {dish.caption ? (
          <p>{dish.caption}</p>
        ) : (
          <p className="dish-card-no-caption">A Pittsburgh favorite.</p>
        )}
      </div>
    </article>
  );
}

function App() {
  const queryClient = useQueryClient();
  const dishesQuery = useListDishes();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setSuccessMessage('');
    setUploadError('');

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setSelectedFile(null);
      event.currentTarget.value = '';
      setUploadError('Choose a JPEG, PNG, or WebP photo. GIFs are not supported.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setSelectedFile(null);
      event.currentTarget.value = '';
      setUploadError('That file is over 3 MB. Choose a smaller photo to upload.');
      return;
    }

    setSelectedFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError('');
    setSuccessMessage('');

    if (!title.trim()) {
      setUploadError('Add a title for your dish photo.');
      return;
    }

    if (!selectedFile) {
      setUploadError('Choose a JPEG, PNG, or WebP photo to upload.');
      return;
    }

    setIsPreparing(true);
    try {
      const image = await resizeImage(selectedFile);
      const savedDish = await createDish({
        title: title.trim(),
        caption: caption.trim(),
        image,
      });

      queryClient.setQueryData<DishPhoto[]>(getListDishesQueryKey(), (dishes) =>
        [savedDish, ...(dishes ?? []).filter((dish) => dish.id !== savedDish.id)],
      );
      void queryClient.invalidateQueries({ queryKey: getListDishesQueryKey() });
      setTitle('');
      setCaption('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSuccessMessage('Your dish is now in the gallery. Thanks for sharing!');
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setIsPreparing(false);
    }
  }

  const isBusy = isPreparing;

  return (
    <main className="dish-app">
      <header className="dish-header">
        <a className="dish-brand" href="/" aria-label="Pittsburgh on a Plate home">
          <span className="dish-brand-mark">
            <UtensilsCrossed size={20} strokeWidth={2.2} />
          </span>
          <span>Pittsburgh <em>on a Plate</em></span>
        </a>
        <span className="dish-header-location">
          <MapPin size={15} />
          Pittsburgh, Pennsylvania
        </span>
      </header>

      <section className="dish-hero">
        <div className="dish-hero-copy">
          <span className="dish-eyebrow"><span /> A little taste of home</span>
          <h1>Good food.<br /><em>Good neighbors.</em></h1>
          <p>
            From a Primanti's piled high to your grandma's haluski, share the
            dishes that make Pittsburgh feel like Pittsburgh.
          </p>
          <div className="dish-community-note">
            <span className="dish-community-icon"><Camera size={17} /></span>
            <span>Made by Pittsburghers, shared with everyone.</span>
          </div>
        </div>

        <form className="dish-upload-card" onSubmit={handleSubmit}>
          <div className="dish-upload-heading">
            <span className="dish-upload-icon"><ImagePlus size={19} /></span>
            <div>
              <h2>Share your favorite</h2>
              <p>Put your Pittsburgh plate on the map.</p>
            </div>
          </div>

          <label className="dish-field-label" htmlFor="dish-title">Dish name</label>
          <input
            className="dish-input"
            id="dish-title"
            type="text"
            maxLength={120}
            placeholder="e.g. Primanti Bros. sandwich"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setUploadError('');
            }}
            required
          />

          <label className="dish-field-label" htmlFor="dish-caption">
            A little story <span>Optional</span>
          </label>
          <textarea
            className="dish-input dish-textarea"
            id="dish-caption"
            maxLength={500}
            placeholder="Where do you get it? What makes it special?"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            rows={3}
          />

          <input
            ref={fileInputRef}
            className="dish-file-input"
            id="dish-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
          />
          <label className="dish-field-label" htmlFor="dish-image">Your photo</label>
          <button
            className={`dish-file-picker${selectedFile ? ' has-file' : ''}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-describedby="dish-file-help"
          >
            {previewUrl ? (
              <img className="dish-file-preview" src={previewUrl} alt="" />
            ) : (
              <span className="dish-file-placeholder"><ImagePlus size={20} /></span>
            )}
            <span className="dish-file-copy">
              <strong>{selectedFile?.name ?? 'Choose a photo'}</strong>
              <small id="dish-file-help">JPEG, PNG or WebP · up to 3 MB</small>
            </span>
            <span className="dish-browse">Browse</span>
          </button>
          <p className="dish-resize-note">Photos are resized to fit within 1280 px before upload.</p>

          {uploadError && (
            <p className="dish-feedback dish-feedback-error" role="alert">
              <CircleAlert size={16} /> {uploadError}
            </p>
          )}
          {successMessage && (
            <p className="dish-feedback dish-feedback-success" role="status">
              <Check size={16} /> {successMessage}
            </p>
          )}

          <button className="dish-submit" type="submit" disabled={isBusy}>
            {isBusy ? (
              <><LoaderCircle className="dish-spinner" size={17} /> Preparing your photo…</>
            ) : (
              <>Add to the gallery <span aria-hidden="true">→</span></>
            )}
          </button>
        </form>
      </section>

      <section className="dish-gallery" aria-labelledby="gallery-title">
        <div className="dish-gallery-heading">
          <div>
            <span className="dish-eyebrow">From our kitchens to yours</span>
            <h2 id="gallery-title">The neighborhood table</h2>
          </div>
          {dishesQuery.data && (
            <span className="dish-photo-count">
              {dishesQuery.data.length} {dishesQuery.data.length === 1 ? 'dish' : 'dishes'} shared
            </span>
          )}
        </div>

        {dishesQuery.isPending ? (
          <div className="dish-gallery-state" role="status">
            <LoaderCircle className="dish-spinner" size={22} />
            <span>Setting the table…</span>
          </div>
        ) : dishesQuery.isError ? (
          <div className="dish-gallery-state dish-gallery-error" role="alert">
            <CircleAlert size={22} />
            <p>We couldn’t load the gallery. {errorMessage(dishesQuery.error)}</p>
            <button type="button" onClick={() => void dishesQuery.refetch()}>Try again</button>
          </div>
        ) : dishesQuery.data.length === 0 ? (
          <div className="dish-gallery-empty">
            <span className="dish-empty-icon"><UtensilsCrossed size={25} /></span>
            <h3>Pull up a chair.</h3>
            <p>Be the first to share a Pittsburgh dish with the neighborhood.</p>
          </div>
        ) : (
          <div className="dish-grid">
            {dishesQuery.data.map((dish) => <DishCard key={dish.id} dish={dish} />)}
          </div>
        )}
      </section>

      <footer className="dish-footer">
        <span>With love, from the 'Burgh.</span>
        <span>Good things are always cooking here.</span>
      </footer>
    </main>
  );
}

export default App;
