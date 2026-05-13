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

type Step = 'choose' | 'upload' | 'camera' | 'analyzing' | 'results' | 'error' | 'sent';

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
  extractedTests: ExtractedTest[] = [];
  doctorNotes = '';
  cityFilter = '';
  sortBy = 'price-asc';
  errorMsg = '';
  analysisProgress = '';
  allTests: TestItem[] = [];

  // ─── User details for prescription notification ───────────────────────────
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
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      this.showError('Please upload an image file (JPG, PNG, WEBP) or PDF.');
      return;
    }
    this.selectedFile = file;
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
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      const vid = this.videoEl?.nativeElement;
      if (vid) {
        vid.srcObject = this.stream;
        await vid.play();
        this.zone.run(() => { this.cameraReady = true; });
      }
    } catch (err: any) {
      this.zone.run(() => {
        this.cameraError = err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please use Upload instead.'
          : 'Could not access camera. Please use Upload instead.';
      });
    }
  }

  capturePhoto() {
    const vid = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    canvas.width = vid.videoWidth || 1280;
    canvas.height = vid.videoHeight || 720;
    canvas.getContext('2d')!.drawImage(vid, 0, 0, canvas.width, canvas.height);
    this.capturedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    this.previewUrl = this.capturedDataUrl;
    this.selectedFile = null;
    this.stopCamera();
  }

  retakePhoto() {
    this.capturedDataUrl = null;
    this.previewUrl = null;
    this.cameraReady = false;
    this.cameraError = '';
    setTimeout(() => this.startCamera(), 100);
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  canAnalyze(): boolean {
    return !!(this.selectedFile || this.capturedDataUrl);
  }

  // ─── Validate user details form ───────────────────────────────────────────
  validateForm(): boolean {
    this.nameError = '';
    this.phoneError = '';
    let valid = true;

    if (!this.userName.trim()) {
      this.nameError = 'Please enter your name';
      valid = false;
    }

    if (!this.userPhone.trim()) {
      this.phoneError = 'Please enter your phone number';
      valid = false;
    } else if (!/^[6-9]\d{9}$/.test(this.userPhone.trim())) {
      this.phoneError = 'Please enter a valid 10-digit phone number';
      valid = false;
    }

    return valid;
  }

  // ─── Send prescription to team via email ──────────────────────────────────
  async sendToTeam() {
    if (!this.validateForm()) return;

    if (!this.canAnalyze()) {
      return;
    }

    this.sending = true;

    try {
      const formData = new FormData();
      formData.append('userName', this.userName.trim());
      formData.append('userPhone', this.userPhone.trim());

      if (this.capturedDataUrl) {
        const res = await fetch(this.capturedDataUrl);
        const blob = await res.blob();
        const compressed = await this.compressBlob(blob);
        formData.append('file', compressed, 'prescription.jpg');
      } else if (this.selectedFile) {
        if (this.selectedFile.type.startsWith('image/')) {
          const dataUrl = await this.toDataUrl(this.selectedFile);
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const compressed = await this.compressBlob(blob);
          formData.append('file', compressed, this.selectedFile.name);
        } else {
          // PDF - send as is
          formData.append('file', this.selectedFile, this.selectedFile.name);
        }
      }

      const response = await fetch(`${environment.apiUrl}/prescription/notify`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || 'Server error');
      }

      this.zone.run(() => {
        this.step = 'sent';
      });

    } catch (err: any) {
      this.zone.run(() => {
        this.showError('Failed to send prescription. Please try again or call us directly.');
      });
    } finally {
      this.zone.run(() => {
        this.sending = false;
      });
    }
  }

  private compressBlob(blob: Blob): Promise<Blob> {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        const maxW = 1200;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => { resolve(b!); }, 'image/jpeg', 0.80);
      };
      img.src = url;
    });
  }

  private toDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => { resolve(reader.result as string); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  goBack() {
    this.stopCamera();
    if (this.step === 'results' || this.step === 'error' || this.step === 'sent') {
      this.reset();
    } else {
      this.step = 'choose';
      this.selectedFile = null;
      this.capturedDataUrl = null;
      this.previewUrl = null;
      this.cameraReady = false;
      this.cameraError = '';
    }
  }

  reset() {
    this.stopCamera();
    this.step = 'choose';
    this.selectedFile = null;
    this.capturedDataUrl = null;
    this.previewUrl = null;
    this.extractedTests = [];
    this.errorMsg = '';
    this.doctorNotes = '';
    this.cameraReady = false;
    this.cameraError = '';
    this.userName = '';
    this.userPhone = '';
    this.nameError = '';
    this.phoneError = '';
    this.sending = false;
  }

  private showError(msg: string) {
    this.errorMsg = msg;
    this.step = 'error';
  }

  sortedPrices(prices: PriceDTO[]): PriceDTO[] {
    const p = [...prices];
    if (this.sortBy === 'price-asc')  { return p.sort((a, b) => a.effectivePrice - b.effectivePrice); }
    if (this.sortBy === 'price-desc') { return p.sort((a, b) => b.effectivePrice - a.effectivePrice); }
    if (this.sortBy === 'rating')     { return p.sort((a, b) => b.labRating - a.labRating); }
    return p.sort((a, b) => a.labName.localeCompare(b.labName));
  }

  lowestPrice(prices: PriceDTO[]): number {
    if (!prices || prices.length === 0) { return 0; }
    return Math.min(...prices.map(p => p.effectivePrice));
  }

  get matchedCount(): number {
    return this.extractedTests.filter(et => et.matched !== null).length;
  }

  get totalMinCost(): number {
    let total = 0;
    for (const et of this.extractedTests) {
      if (et.prices.length > 0) { total += this.lowestPrice(et.prices); }
    }
    return total;
  }

  getInitials(name: string): string {
    return name.split(' ').filter(Boolean).map((w: string) => w[0].toUpperCase()).slice(0, 2).join('');
  }

  bookNow(price: PriceDTO) {
    this.router.navigate(['/book'], { state: { price: price } });
  }

  onCityChange() {
    for (const et of this.extractedTests) {
      if (et.matched) {
        et.loading = true;
        this.api.searchPrices(et.matched.id, this.cityFilter || undefined).subscribe({
          next: p => this.zone.run(() => { et.prices = p; et.loading = false; }),
          error: () => this.zone.run(() => { et.loading = false; })
        });
      }
    }
  }
}