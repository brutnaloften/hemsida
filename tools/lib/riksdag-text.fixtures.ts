/**
 * Condensed HD01SoU1 (bet 2025/26:SoU1) in the shape data.riksdagen.se/dokument/<id>.text
 * returns it: dokumentstatus XML whose <html> holds XML-escaped HTML, numeric entities for
 * soft hyphens and non-breaking spaces, text split into <span> runs. Passages are verbatim.
 */
export const HD01SOU1_TEXT = `<dokumentstatus><dokument>
 <dok_id>HD01SoU1</dok_id>
 <html>&lt;style&gt;&lt;!-- .x { margin:0 } --&gt;&lt;/style&gt;
&lt;p class="TOC1"&gt;&lt;a href="#t"&gt;&lt;span class="Hyperlink"&gt;Särskilda yttranden&lt;/span&gt;&lt;/a&gt;&lt;/p&gt;
&lt;h2&gt;&lt;span&gt;Utskottets överväganden&lt;/span&gt;&lt;/h2&gt;
&lt;p class="R5"&gt;&lt;span&gt;Anslaget 1:6 Bidrag till folkhälsa och sjukvård&lt;/span&gt;&lt;/p&gt;
&lt;p class="NormalIndent"&gt;&lt;span&gt;Anslaget tillförs 200&lt;/span&gt;&lt;span&gt;&amp;#xa0;&lt;/span&gt;&lt;span&gt;000&lt;/span&gt;&lt;span&gt;&amp;#xa0;&lt;/span&gt;&lt;span&gt;000 kronor 2026 för att skapa en jämlik person&lt;/span&gt;&lt;span&gt;&amp;#xad;&lt;/span&gt;&lt;span&gt;centrerad och tillgänglig vård för personer som har utsatts för sexuellt våld. Satsningen på kvinnors och flickors hälsa och mödravården fortsätter. För 2026 avsätts 1&lt;/span&gt;&lt;span&gt;&amp;#xa0;&lt;/span&gt;&lt;span&gt;000&lt;/span&gt;&lt;span&gt;&amp;#xa0;&lt;/span&gt;&lt;span&gt;000&lt;/span&gt;&lt;span&gt;&amp;#xa0;&lt;/span&gt;&lt;span&gt;000 kronor. &lt;/span&gt;&lt;/p&gt;
&lt;p class="R4"&gt;&lt;span&gt;Motionerna&lt;/span&gt;&lt;/p&gt;
&lt;p class="R4"&gt;&lt;span&gt;Miljöpartiet&lt;/span&gt;&lt;/p&gt;
&lt;p&gt;&lt;span&gt;Motionärerna anser att satsningen på kvinnors hälsa, mödrahälsovård och förlossningsvård bör förstärkas och avsätter 600&amp;#xa0;000&amp;#xa0;000 kronor till detta.&lt;/span&gt;&lt;/p&gt;
&lt;p class="Avsnittsrubrik"&gt;&lt;span&gt;Särskilda yttranden&lt;/span&gt;&lt;/p&gt;
&lt;p class="Mellanrum"&gt;&lt;span&gt; &lt;/span&gt;&lt;/p&gt;
&lt;p&gt;&lt;span&gt;1.&lt;/span&gt;&lt;/p&gt;
&lt;p class="Srskiltyttranderubrik"&gt;&lt;span&gt;Statens budget inom utgiftsområde 9, punkt 2 (S)&lt;/span&gt;&lt;/p&gt;
&lt;p&gt;&lt;span&gt;Vidare har regeringen valt att sänka den särskilda satsningen på mödravård, förlossningsvård och vård för sjukdomar som drabbar kvinnor.&lt;/span&gt;&lt;/p&gt;
&lt;p class="Bilagerubrik"&gt;&lt;span&gt;Bilaga 1&lt;/span&gt;&lt;/p&gt;
&lt;p&gt;&lt;span&gt;Förteckning över behandlade förslag&lt;/span&gt;&lt;/p&gt;
</html>
</dokument></dokumentstatus>`;

export const HC01SOU1_AMOUNT_PARAGRAPH =
  'För 2024 avsattes 1 600 000 000 kronor för förlossningsvård och kvinnors hälsa. För 2025 avsätts motsvarande belopp.';

/** Condensed PDF-to-HTML SOU: ToC as a table with #page_N links, headings only as font classes. */
export const SOU_PDF_TOC = `<STYLE>.p1{}</STYLE>
<DIV id="page_1"><P class="p0 ft0">SOU 2025:1 Ett förslag</P></DIV>
<DIV id="page_2">
<P class="p2 ft2">Innehåll</P>
<TABLE>
<TR><TD><SPAN><A href="#page_3">&nbsp;</A></SPAN></TD><TD colspan=2><A href="#page_3">Sammanfattning ........ </A></TD><TD><A href="#page_3">3</A></TD></TR>
<TR><TD><A href="#page_4">1</A></TD><TD colspan=2><A href="#page_4">Författningsförslag ........ </A></TD><TD><A href="#page_4">4</A></TD></TR>
<TR><TD>&nbsp;</TD><TD><A href="#page_4">1.1</A></TD><TD><A href="#page_4">Förslag till lag ........ </A></TD><TD><A href="#page_4">4</A></TD></TR>
<TR><TD><A href="#page_5">2</A></TD><TD colspan=2><A href="#page_5">Utredningens uppdrag och</A></TD><TD>&nbsp;</TD></TR>
<TR><TD>&nbsp;</TD><TD>&nbsp;</TD><TD><A href="#page_5">arbete ........ </A></TD><TD><A href="#page_5">5</A></TD></TR>
<TR><TD><A href="#page_6">3</A></TD><TD colspan=2><A href="#page_6">Konsekvenser ........ </A></TD><TD><A href="#page_6">6</A></TD></TR>
<TR><TD>&nbsp;</TD><TD>&nbsp;</TD><TD><A href="#page_7">Bilaga 1 Direktiv ........ </A></TD><TD><A href="#page_7">7</A></TD></TR>
</TABLE>
</DIV>
<DIV id="page_3"><P class="p3 ft3">Sammanfattning</P><P class="p4 ft4">Utredningen föreslår en ny lag.</P></DIV>
<DIV id="page_4"><P class="p3 ft3">1 Författningsförslag</P><P class="p4 ft4">Härigenom föreskrivs följande.</P></DIV>
<DIV id="page_5"><P class="p4 ft4">Uppdraget beskrivs här.</P></DIV>
<DIV id="page_6"><P class="p3 ft3">3 Konsekvenser</P><P class="p4 ft4">Förslaget kostar 10 miljoner kronor.</P></DIV>
<DIV id="page_7"><P class="p4 ft4">Direktivets text.</P></DIV>`;

/** Condensed PDF-to-HTML document with no ToC links at all. */
export const SOU_PDF_NO_TOC = `<DIV id="page_1">
<P class="p1 ft1">Sammanfattning</P><P class="p2 ft2">Vi föreslår en ändring i lagen.</P>
<P class="p1 ft1">1 Inledning</P><P class="p2 ft2">Uppdraget gavs 2024.</P>
<P class="p1 ft1">2 Bakgrund</P><P class="p2 ft2">Tidigare utredningar visar följande.</P>
<P class="p2 ft2">3 miljoner kronor avsätts, vilket motsvarar ungefär en procent.</P>
<P class="p1 ft1">3 Förslag</P><P class="p2 ft2">Vi föreslår en höjning.</P>
</DIV>`;
