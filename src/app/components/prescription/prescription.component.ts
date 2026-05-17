import { Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService, TestItem, PriceDTO } from '../../services/api.service';
import { environment } from '../../../environments/environment';

export interface ExtractedTest {
  raw: string;
  matched: TestItem | null;
  prices: PriceDTO[];
  loading: boolean;
  expanded: boolean;
}

type Step = 'choose' | 'upload' | 'camera' | 'sending' | 'sent' | 'error';

@Component({
  selector: 'app-prescription',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './prescription.component.html',
  styleUrl: './prescription.component.scss'
})
export class PrescriptionComponent implements OnInit, OnDestroy {

  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput') fileInputEl!: ElementRef<HTMLInputElement>;
  @ViewChild('cameraInput') cameraInputEl!: ElementRef<HTMLInputElement>;

  step: Step = 'choose';
  dragOver = false;
  selectedFile: File | null = null;
  capturedDataUrl: string | null = null;
  previewUrl: string | null = null;
  stream: MediaStream | null = null;
  cameraReady = false;
  cameraError = '';
  errorMsg = '';
  allTests: TestItem[] = [];

  // User details
  userName = '';
  userPhone = '';
  sending = false;
  nameError = '';
  phoneError = '';

  constructor(private api: ApiService, private router: Router, private zone: NgZone) {}

  ngOnInit() {
    this.api.getTests().subscribe(t => { this.allTests = t; });
  }

  ngOnDestroy() { this.stopCamera(); }

  selectUpload() { this.step = 'upload'; }

  selectCamera() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      setTimeout(() => this.cameraInputEl?.nativeElement.click(), 100);
    } else {
      this.step = 'camera';
      this.cameraReady = false;
      this.cameraError = '';
      setTimeout(() => this.startCamera(), 100);
    }
  }

  onCameraFileCaptured(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.selectedFile = file;
    this.capturedDataUrl = null;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.zone.run(() => {
        this.previewUrl = e.target?.result as string;
        this.step = 'upload';
      });
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.dragOver = true; }
  onDragLeave() { this.dragOver = false; }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) { this.setFile(file); }
  }

  onFileSelected(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) { this.setFile(file); }
  }

  setFile(file: File) {
    const isImage = file.type.startsWith('image/');
    const isPdf   = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      this.showError('Please upload an image file (JPG, PNG, WEBP) or PDF.');
      return;
    }
    this.selectedFile    = file;
    this.capturedDataUrl = null;
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => this.zone.run(() => { this.previewUrl = reader.result as string; });
      reader.readAsDataURL(file);
    } else {
      this.previewUrl = null;
    }
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      const vid = this.videoEl?.nativeElement;
      if (vid) { vid.srcObject = this.stream; await vid.play(); this.zone.run(() => { this.cameraReady = true; }); }
    } catch (err: any) {
      this.zone.run(() => {
        this.cameraError = err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please use Upload instead.'
          : 'Could not access camera. Please use Upload instead.';
      });
    }
  }

  capturePhoto() {
    const vid    = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    canvas.width  = vid.videoWidth  || 1280;
    canvas.height = vid.videoHeight || 720;
    canvas.getContext('2d')!.drawImage(vid, 0, 0, canvas.width, canvas.height);
    this.capturedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    this.previewUrl      = this.capturedDataUrl;
    this.selectedFile    = null;
    this.stopCamera();
    this.step = 'upload'; // show preview + form on upload screen
  }

  retakePhoto() {
    this.capturedDataUrl = null;
    this.previewUrl      = null;
    this.cameraReady     = false;
    this.cameraError     = '';
    this.step            = 'camera';
    setTimeout(() => this.startCamera(), 100);
  }

  stopCamera() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  }

  canSend(): boolean { return !!(this.selectedFile || this.capturedDataUrl); }

  validateForm(): boolean {
    this.nameError  = '';
    this.phoneError = '';
    let valid = true;
    if (!this.userName.trim())                              { this.nameError  = 'Please enter your name'; valid = false; }
    if (!this.userPhone.trim())                             { this.phoneError = 'Please enter your phone number'; valid = false; }
    else if (!/^[6-9]\d{9}$/.test(this.userPhone.trim())) { this.phoneError = 'Please enter a valid 10-digit phone number'; valid = false; }
    return valid;
  }

  // ─── Send prescription directly — no Razorpay ────────────────────────────
  // POSTs name + phone + image to /api/prescription/notify as multipart.
  // Backend sends team email with image as attachment.
  async sendToTeam() {
    if (!this.validateForm()) return;
    if (!this.canSend()) return;

    this.sending = true;

    try {
      let fileToSend: File;

      if (this.selectedFile) {
        // Uploaded file — compress if image, PDF as-is
        if (this.selectedFile.type.startsWith('image/')) {
          const compressed = await this.compressBlob(this.selectedFile);
          fileToSend = new File([compressed], this.selectedFile.name, { type: 'image/jpeg' });
        } else {
          fileToSend = this.selectedFile;
        }
      } else {
        // Webcam capture — convert data URL to File
        const blob       = await fetch(this.capturedDataUrl!).then(r => r.blob());
        const compressed = await this.compressBlob(blob);
        fileToSend       = new File([compressed], 'prescription.jpg', { type: 'image/jpeg' });
      }

      const formData = new FormData();
      formData.append('userName',  this.userName.trim());
      formData.append('userPhone', this.userPhone.trim());
      formData.append('file', fileToSend, fileToSend.name);

      // Do NOT set Content-Type — browser sets it with multipart boundary automatically
      const res = await fetch(`${environment.apiUrl}/prescription/notify`, {
        method: 'POST',
        body: formData
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to send prescription');
      }

      // Success — show confirmation screen
      this.step = 'sent';

    } catch (err: any) {
      this.showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      this.sending = false;
    }
  }

  // Compress image before sending to reduce email size
  private compressBlob(blob: Blob): Promise<Blob> {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        const maxW   = 1200;
        const scale  = img.width > maxW ? maxW / img.width : 1;
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => { resolve(b!); }, 'image/jpeg', 0.80);
      };
      img.src = url;
    });
  }

  goBack() {
    this.stopCamera();
    if (this.step === 'sent' || this.step === 'error') {
      this.reset();
    } else {
      this.step            = 'choose';
      this.selectedFile    = null;
      this.capturedDataUrl = null;
      this.previewUrl      = null;
      this.cameraReady     = false;
      this.cameraError     = '';
    }
  }

  reset() {
    this.stopCamera();
    this.step            = 'choose';
    this.selectedFile    = null;
    this.capturedDataUrl = null;
    this.previewUrl      = null;
    this.errorMsg        = '';
    this.cameraReady     = false;
    this.cameraError     = '';
    this.userName        = '';
    this.userPhone       = '';
    this.nameError       = '';
    this.phoneError      = '';
    this.sending         = false;
  }

  private showError(msg: string) { this.errorMsg = msg; this.step = 'error'; }

  // Unused but kept so other template references don't break
  sortedPrices(prices: PriceDTO[]): PriceDTO[] { return [...prices].sort((a, b) => a.effectivePrice - b.effectivePrice); }
  lowestPrice(prices: PriceDTO[]): number { return prices.length ? Math.min(...prices.map(p => p.effectivePrice)) : 0; }
  bookNow(price: PriceDTO) { this.router.navigate(['/book'], { state: { price } }); }
}