import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router'; // ✅ Añadir ActivatedRoute

@Component({
  selector: 'app-link-generator',
  templateUrl: './link-generator.component.html',
  styleUrls: ['./link-generator.component.css']
})
export class LinkGeneratorComponent implements OnInit {
  tumorType: string = '';
  alterationGene: string = '';
  alterationType: string = '';
  treatmentDrug: string = '';
  treatmentFamily: string = '';
  treatmentResponse: string = '';

  // Opciones predefinidas
  tumorTypes: string[] = [
    'Breast_Invasive_Ductal_Carcinoma',
    'Lung_Adenocarcinoma', 
    'Prostate_Adenocarcinoma',
    'Skin_Cutaneous_Melanoma',
    'Colon_Adenocarcinoma',
    'Ovarian_Serous_Cystadenocarcinoma',
    'Brain_Glioblastoma',
    'general'
  ];

  alterationTypes: string[] = ['Mutation', 'Translocation', 'Copy_number_alteration'];
  responseTypes: string[] = ['responsive', 'resistant'];

  constructor(
    private router: Router,
    private route: ActivatedRoute // ✅ ActivatedRoute inyectado
  ) {}

  ngOnInit() {
    // ✅ Pre-cargar valores desde query parameters
    this.route.queryParams.subscribe((params: any) => { // ✅ Tipo 'any' para params
      if (params['tumor_type']) this.tumorType = params['tumor_type'];
      if (params['gene']) this.alterationGene = params['gene'];
      if (params['mutation_type']) this.alterationType = params['mutation_type'];
      if (params['treatment_drug']) this.treatmentDrug = params['treatment_drug'];
      if (params['treatment_family']) this.treatmentFamily = params['treatment_family'];
      if (params['treatment_response']) this.treatmentResponse = params['treatment_response'];

      // console.log('🔍 Valores pre-cargados en Link Generator:', params);
    });
  }

  generateLink() {
    const queryParams: any = {};
    
    // Configurar query parameters
    if (this.tumorType) {
      queryParams.tumor_type = this.tumorType;
      queryParams.cancer_type = this.tumorType;
    }
    if (this.alterationGene) queryParams.gene = this.alterationGene;
    if (this.alterationType) queryParams.mutation_type = this.alterationType;
    if (this.treatmentDrug) queryParams.treatment_drug = this.treatmentDrug;
    if (this.treatmentFamily) queryParams.treatment_family = this.treatmentFamily;
    if (this.treatmentResponse) queryParams.treatment_response = this.treatmentResponse;

    // console.log('Navegando al Chat con filters:', queryParams);

    // ✅ Ir directamente al Chat con los filters
    this.router.navigate(['/chat'], { queryParams: queryParams });
  }

  resetForm() {
    this.tumorType = '';
    this.alterationGene = '';
    this.alterationType = '';
    this.treatmentDrug = '';
    this.treatmentFamily = '';
    this.treatmentResponse = '';
  }

  generateShareableLink(): string {
    const params = new URLSearchParams();
    
    if (this.tumorType) {
      params.append('tumor_type', this.tumorType);
      params.append('cancer_type', this.tumorType);
    }
    if (this.alterationGene) params.append('gene', this.alterationGene);
    if (this.alterationType) params.append('mutation_type', this.alterationType);
    if (this.treatmentDrug) params.append('treatment_drug', this.treatmentDrug);
    if (this.treatmentFamily) params.append('treatment_family', this.treatmentFamily);
    if (this.treatmentResponse) params.append('treatment_response', this.treatmentResponse);

    return `${window.location.origin}/chat?${params.toString()}`;
  }

  copyToClipboard() {
    const link = this.generateShareableLink();
    navigator.clipboard.writeText(link).then(() => {
      alert('Link copied to clipboard!');
    });
  }

  // ✅ Método para navegar al Home (por si necesitas)
  goToHome() {
    this.router.navigate(['/home']);
  }
}