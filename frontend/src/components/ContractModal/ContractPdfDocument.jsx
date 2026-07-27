import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import melPetHostelHeaderImage from "../../pages/MelPetHostel/assets/MelPetHostel_Background.png";
import {
  CONTRACT_ACCEPTANCE_NOTICE,
  CONTRACT_ACKNOWLEDGEMENTS,
  CONTRACT_HEADER_NOTICE,
  CONTRACT_HEADER_SUBTITLE,
  CONTRACT_INTRO,
  CONTRACT_SECTIONS,
  CONTRACT_TITLE,
} from "./contractContent";

const styles = StyleSheet.create({
  page: {
    paddingTop: "51mm",
    paddingBottom: "20mm",
    fontFamily: "Times-Roman",
    fontSize: 9.8,
    lineHeight: 1.36,
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  content: {
    marginRight: "18mm",
    marginLeft: "18mm",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: "210mm",
    height: "42mm",
    backgroundColor: "#173f85",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    borderBottomStyle: "solid",
  },
  headerImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "210mm",
    height: "42mm",
    objectFit: "fill",
  },
  noticeBlock: {
    marginBottom: 8,
    paddingTop: 5,
    paddingRight: 8,
    paddingBottom: 5,
    paddingLeft: 8,
    borderWidth: 1,
    borderColor: "#cfcfcf",
    borderStyle: "solid",
    textAlign: "center",
  },
  headerNotice: {
    color: "#111111",
    fontFamily: "Times-Bold",
    fontSize: 7.5,
    lineHeight: 1.3,
    textTransform: "uppercase",
  },
  headerSubtitle: {
    marginTop: 3,
    color: "#333333",
    fontFamily: "Times-Bold",
    fontSize: 7.2,
    textTransform: "uppercase",
  },
  title: {
    marginBottom: 8,
    fontFamily: "Times-Bold",
    fontSize: 11.6,
    lineHeight: 1.25,
    textAlign: "center",
    textTransform: "uppercase",
  },
  intro: {
    marginBottom: 7,
    textAlign: "justify",
    textIndent: 18,
  },
  section: {
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: "#b5b5b5",
    borderTopStyle: "solid",
  },
  sectionTitle: {
    marginBottom: 4,
    fontFamily: "Times-Bold",
    fontSize: 9.8,
    lineHeight: 1.25,
    textTransform: "uppercase",
  },
  paragraph: {
    marginBottom: 4,
    textAlign: "justify",
  },
  bold: {
    fontFamily: "Times-Bold",
  },
  listItem: {
    marginBottom: 4,
    flexDirection: "row",
  },
  itemNumber: {
    width: 28,
    paddingRight: 4,
    fontFamily: "Times-Bold",
  },
  itemBody: {
    flex: 1,
  },
  itemText: {
    textAlign: "justify",
  },
  subitems: {
    marginTop: 3,
    marginLeft: 8,
  },
  subitemText: {
    marginBottom: 2.5,
    textAlign: "justify",
  },
  note: {
    marginTop: 4,
    padding: 5,
    borderWidth: 1,
    borderColor: "#999999",
    borderStyle: "solid",
    fontSize: 9,
    textAlign: "justify",
  },
  fieldSection: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#b5b5b5",
    borderTopStyle: "solid",
  },
  fieldGrid: {
    marginTop: 5,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  field: {
    width: "49%",
    padding: 5,
    borderWidth: 1,
    borderColor: "#777777",
    borderStyle: "solid",
  },
  fieldFull: {
    width: "100%",
  },
  fieldLabel: {
    marginBottom: 2,
    fontFamily: "Times-Bold",
    fontSize: 7.5,
    textTransform: "uppercase",
  },
  fieldValue: {
    minHeight: 11,
    fontSize: 9.2,
  },
  signatureBlock: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#777777",
    borderTopStyle: "solid",
  },
  signatureText: {
    marginBottom: 5,
    fontFamily: "Times-Bold",
    fontSize: 9.8,
    lineHeight: 1.36,
  },
  signatureLine: {
    marginTop: 42,
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
    borderBottomStyle: "solid",
  },
  signatureName: {
    marginTop: 6,
    minHeight: 13,
    fontFamily: "Times-Bold",
    fontSize: 9.4,
    textAlign: "center",
    textTransform: "uppercase",
  },
  signatureLabel: {
    marginTop: 4,
    fontSize: 8.3,
    textAlign: "center",
    textTransform: "uppercase",
  },
  signatureMeta: {
    marginTop: 3,
    fontSize: 8,
    textAlign: "center",
    color: "#333333",
  },
  acceptanceNotice: {
    marginTop: 10,
    fontFamily: "Times-Bold",
    fontSize: 8,
    textAlign: "center",
    textTransform: "uppercase",
  },
  pageNumber: {
    position: "absolute",
    right: "18mm",
    bottom: "8mm",
    fontSize: 7.8,
    color: "#555555",
  },
});

function valueOrBlank(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function fieldRows(contractorData) {
  return [
    ["Nome", contractorData.nome, true],
    ["RG", contractorData.rg],
    ["CPF", contractorData.cpf],
    ["Telefones", contractorData.telefones, true],
    ["E-mail", contractorData.email, true],
    ["CEP", contractorData.cep],
    ["Endereco", contractorData.endereco, true],
    ["Numero", contractorData.numero],
    ["Complemento", contractorData.complemento || "Sem Complemento"],
    ["Bairro", contractorData.bairro],
    ["Cidade", contractorData.cidade],
    ["Estado", contractorData.estado],
  ];
}

function normalizeSectionNumber(number) {
  return String(number || "").replace(/\.$/, "");
}

function renderParagraph(paragraph) {
  if (typeof paragraph === "string") {
    return (
      <Text key={paragraph} style={styles.paragraph}>
        {paragraph}
      </Text>
    );
  }

  return (
    <Text key={`${paragraph.prefix}-${paragraph.text}`} style={styles.paragraph}>
      {paragraph.prefix ? (
        <Text style={styles.bold}>{paragraph.prefix} </Text>
      ) : null}
      {paragraph.text}
    </Text>
  );
}

function renderItemContent(item) {
  if (typeof item === "string") {
    return <Text style={styles.itemText}>{item}</Text>;
  }

  return (
    <>
      <Text style={styles.itemText}>{item.text}</Text>

      {Array.isArray(item.subitems) ? (
        <View style={styles.subitems}>
          {item.subitems.map((subitem) => (
            <Text key={subitem} style={styles.subitemText}>
              {subitem}
            </Text>
          ))}
        </View>
      ) : null}

      {Array.isArray(item.noteList) ? (
        <View style={styles.note}>
          {item.noteList.map((noteItem) => (
            <Text key={noteItem} style={styles.subitemText}>
              - {noteItem}
            </Text>
          ))}
        </View>
      ) : null}

      {item.note ? (
        <Text style={styles.note}>
          {item.notePrefix ? (
            <Text style={styles.bold}>{item.notePrefix} </Text>
          ) : null}
          {item.note}
        </Text>
      ) : null}
    </>
  );
}

function ContractSectionPdf({ section }) {
  const sectionNumber = normalizeSectionNumber(section.number);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {section.number} {section.title}
      </Text>

      {section.paragraphs?.map(renderParagraph)}

      {section.items?.map((item, index) => (
        <View key={`${section.number}-${index}`} style={styles.listItem}>
          <Text style={styles.itemNumber}>{sectionNumber}.{index + 1}.</Text>
          <View style={styles.itemBody}>{renderItemContent(item)}</View>
        </View>
      ))}
    </View>
  );
}

function ContractPdfHeader() {
  return (
    <View fixed style={styles.header}>
      <Image src={melPetHostelHeaderImage} style={styles.headerImage} />
    </View>
  );
}

function ContractPdfNotice() {
  return (
    <View style={styles.noticeBlock} wrap={false}>
      <Text style={styles.headerNotice}>{CONTRACT_HEADER_NOTICE}</Text>
      <Text style={styles.headerSubtitle}>{CONTRACT_HEADER_SUBTITLE}</Text>
    </View>
  );
}

export default function ContractPdfDocument({
  browserName,
  clientIp,
  contractorData,
  signatureCity,
  signatureDate,
  signatureTime,
}) {
  return (
    <Document title={CONTRACT_TITLE} author="Mel Pet Hostel">
      <Page size="A4" style={styles.page} wrap>
        <ContractPdfHeader />

        <View style={styles.content}>
          <ContractPdfNotice />
          <Text style={styles.title}>{CONTRACT_TITLE}</Text>
          <Text style={styles.intro}>{CONTRACT_INTRO}</Text>

          {CONTRACT_SECTIONS.map((section) => (
            <ContractSectionPdf key={section.number} section={section} />
          ))}

          <View style={styles.fieldSection}>
            <Text style={styles.sectionTitle}>10. DADOS DO CONTRATANTE</Text>
            <View style={styles.fieldGrid}>
              {fieldRows(contractorData).map(([label, value, full]) => (
                <View
                  key={label}
                  wrap={false}
                  style={[styles.field, full ? styles.fieldFull : null]}
                >
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <Text style={styles.fieldValue}>{valueOrBlank(value)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.signatureBlock} wrap={false}>
            {CONTRACT_ACKNOWLEDGEMENTS.map((text) => (
              <Text key={text} style={styles.signatureText}>
                {text}
              </Text>
            ))}

            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>
              {valueOrBlank(contractorData.nome, " ")}
            </Text>
            <Text style={styles.signatureLabel}>
              CONTRATANTE (TUTOR/RESPONSAVEL LEGAL)
            </Text>
            <Text style={styles.signatureMeta}>
              {signatureCity}, {signatureDate}
            </Text>
            <Text style={styles.signatureMeta}>
              {signatureTime} | IP: {clientIp} | Navegador: {browserName}
            </Text>
            <Text style={styles.acceptanceNotice}>
              {CONTRACT_ACCEPTANCE_NOTICE}
            </Text>
          </View>
        </View>

        <Text
          fixed
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Pagina ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
