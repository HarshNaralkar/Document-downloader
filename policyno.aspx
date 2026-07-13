

<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>
	Query Passport
</title><link rel="shortcut icon" href="../favicon.ico" /><link rel="stylesheet" type="text/css" href="../Style/style.css" /><link id="ctl00_lnkStyleColor" rel="stylesheet" type="text/css" href="../Style/StyleP1.css" /><link rel="stylesheet" type="text/css" href="../Style/StyleDivTable.css" /><link rel="stylesheet" type="text/css" href="../Style/jquery-ui-1.8.13.custom.css" /><link rel="stylesheet" type="text/css" href="../Style/ui.dropdownchecklist.themeroller.css" /></head>

<body> 
    <form name="aspnetForm" method="post" action="./policyno.aspx?q=pp" id="aspnetForm">
<div>
<input type="hidden" name="__EVENTTARGET" id="__EVENTTARGET" value="" />
<input type="hidden" name="__EVENTARGUMENT" id="__EVENTARGUMENT" value="" />
<input type="hidden" name="__LASTFOCUS" id="__LASTFOCUS" value="" />
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="OqGGTwcmV6/2iOwzGDFfiqX+8Dr5OwZcAbVe7mwQ8IYkvBMYv4hMmaqKbH4aRa3WETXHYpJkKoO6912O0NlKsUhNbovxePAkoGT+tK1xW+8UB1UQjW1dUeswtMIESSxgpBZJ7nQkgq3BWucwaQCjKfJb97e78uSVxgofdc4v1Pcj965vFven0i55axuobYebViOPuA0DeTjjyPcIt9jco7epwjr5dybF65K/KtdrxWrMttAlD08XxlkUboNZY4ChhWcOxYps1iLjuqpTk1AP855yXcDRpCgbXF/N8FLu+yvqhmdfT3nT3t3ar8KZ4xGd3yef/zFS8/QBw7MKKABCaE0JC5Ct1v65FIU+KddH+SKLGBXwbpGIHS6G+wEFNYOToVpTpzqaUnlpZbSxuXDPt6Qck2XwdWZaTzP8qmBu0CbQl2HaXXTHkjW+pEMyJy3Cbt1Tiu7XLsm9OKl0tOLNd8+PBKeOh0pk5TGuUYe/PJHjMLvQqknYAl0xsXsbpNMi47AUUTohWmw5VgvP8x4kDPBMYDcInxi1k+7o6rW96b+qy5HrA67WQ+l1qOdTYTDYmiT96k6reNR8AvrEbLhc6f/nx/ORqzVEter8xAKJtuyRSVtVrtaJQJh12bpKZOfQO/tOh9nbswRyASzpPc8L7iRMIPNwl2dWvckhKOurS3X/HFpWYZeqpv3SGVhz1E7CLKA95oDMkBCsc5AF9PTkGRS66AJJ2yxrjRhryz3cl8KdDdj4BMUs4WXlWTuZBz2kUuu0NL3KHQ1NPoD98MXa8Th6MrpbFCvVXudhCA9yIsrRE/ZpEphYeldJpz13m8Ykxo8j3wI4txBI4EwxsRAHv9jac2qOS+JpZJO3arGF3/4Jydkn4+xv3kYfGk6Enm/4" />
</div>

<script type="text/javascript">
//<![CDATA[
var theForm = document.forms['aspnetForm'];
if (!theForm) {
    theForm = document.aspnetForm;
}
function __doPostBack(eventTarget, eventArgument) {
    if (!theForm.onsubmit || (theForm.onsubmit() != false)) {
        theForm.__EVENTTARGET.value = eventTarget;
        theForm.__EVENTARGUMENT.value = eventArgument;
        theForm.submit();
    }
}
//]]>
</script>


<script src="/WebResource.axd?d=cWOhVi9LFGwh-66wlRESS1lGkDnfqAnqEnStGKqqKSmMxYgJ-LuXXMKV1xNVT_LEbkWTyGwD8v9_zPZH8gtHiO4ykPPVpnPZiKO7zxu91us1&amp;t=638942408805310136" type="text/javascript"></script>


<script src="/ScriptResource.axd?d=rvbmecfPrig4lXzHuwuwEzedjR9tKk9hhjDi9qdS1ZvbGdWfFZouwMNLbfWWDUTB9qQ0UkUsLZbLtyS-FgPLbDjA1PBuCNDBebJBcNqng2knAm2VnwoOuc530SfeRt1U9Bjn5CWJdHY2ziDD7-zaGo2bY8vKCqeTQqpTW-VXlyI1&amp;t=32e5dfca" type="text/javascript"></script>
<script src="/ScriptResource.axd?d=9DNvbPSbOBNZIBmRIaTqTj9PFxjfdAZxXlPMpJSAaAK54z6NHJ-k0fnzDDYV5RcVHGmS1tbN8cHOAQkMIGgrRWDkK9G1q5dVwzoVipGM3NRHtklwgzyehY0w39lTxi05pt7_JkEcqaRKqVg-iL8l2e72dJtSQzjNUzVU3SeYDIhrzmZoyEqOFrsWUSZB57OJ0&amp;t=32e5dfca" type="text/javascript"></script>
<script src="../Script/CommonScript15.09.21.js" type="text/javascript"></script>
<script src="../Script/jquery-1.7.2.min.js" type="text/javascript"></script>
<script type="text/javascript">
//<![CDATA[
var PageMethods = function() {
PageMethods.initializeBase(this);
this._timeout = 0;
this._userContext = null;
this._succeeded = null;
this._failed = null;
}
PageMethods.prototype = {
_get_path:function() {
 var p = this.get_path();
 if (p) return p;
 else return PageMethods._staticInstance.get_path();},
getRptExportPDFXLS:function(sRptType,sPolicyNo,sPassportNo,succeededCallback, failedCallback, userContext) {
return this._invoke(this._get_path(), 'getRptExportPDFXLS',false,{sRptType:sRptType,sPolicyNo:sPolicyNo,sPassportNo:sPassportNo},succeededCallback,failedCallback,userContext); }}
PageMethods.registerClass('PageMethods',Sys.Net.WebServiceProxy);
PageMethods._staticInstance = new PageMethods();
PageMethods.set_path = function(value) { PageMethods._staticInstance.set_path(value); }
PageMethods.get_path = function() { return PageMethods._staticInstance.get_path(); }
PageMethods.set_timeout = function(value) { PageMethods._staticInstance.set_timeout(value); }
PageMethods.get_timeout = function() { return PageMethods._staticInstance.get_timeout(); }
PageMethods.set_defaultUserContext = function(value) { PageMethods._staticInstance.set_defaultUserContext(value); }
PageMethods.get_defaultUserContext = function() { return PageMethods._staticInstance.get_defaultUserContext(); }
PageMethods.set_defaultSucceededCallback = function(value) { PageMethods._staticInstance.set_defaultSucceededCallback(value); }
PageMethods.get_defaultSucceededCallback = function() { return PageMethods._staticInstance.get_defaultSucceededCallback(); }
PageMethods.set_defaultFailedCallback = function(value) { PageMethods._staticInstance.set_defaultFailedCallback(value); }
PageMethods.get_defaultFailedCallback = function() { return PageMethods._staticInstance.get_defaultFailedCallback(); }
PageMethods.set_enableJsonp = function(value) { PageMethods._staticInstance.set_enableJsonp(value); }
PageMethods.get_enableJsonp = function() { return PageMethods._staticInstance.get_enableJsonp(); }
PageMethods.set_jsonpCallbackParameter = function(value) { PageMethods._staticInstance.set_jsonpCallbackParameter(value); }
PageMethods.get_jsonpCallbackParameter = function() { return PageMethods._staticInstance.get_jsonpCallbackParameter(); }
PageMethods.set_path("policyno.aspx");
PageMethods.getRptExportPDFXLS= function(sRptType,sPolicyNo,sPassportNo,onSuccess,onFailed,userContext) {PageMethods._staticInstance.getRptExportPDFXLS(sRptType,sPolicyNo,sPassportNo,onSuccess,onFailed,userContext); }
//]]>
</script>

<div>

	<input type="hidden" name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="2A16EE6A" />
	<input type="hidden" name="__VIEWSTATEENCRYPTED" id="__VIEWSTATEENCRYPTED" value="" />
</div>
    <script type="text/javascript">
//<![CDATA[
Sys.WebForms.PageRequestManager._initialize('ctl00$ScriptManager1', 'aspnetForm', [], [], [], 600, 'ctl00');
//]]>
</script>

    
    <script type="text/javascript" language="javascript">


    </script>

    <div style="width:1010px;margin:0 auto;">
        <div style="width: 38px;float:left;">&nbsp;</div>
        <div style="width: 935px;float:left;">            
             
             
            <!--Header-->
            <div style="text-align: center;">
                
            </div>
            <div class="space-line05"></div>
            <!--Menu-->
            <div id="dMenu">
                
                    <div style="width:100%; height: 105px; text-align: center;float: left;">
                        <div class="left-container01">
                            <img src ="\images/IFFCO/Logo.png" />
                        </div>
                        <div style="float: right;width: 20%;">
                            <label class="labelWelComeUser">Welcome:</label>
                            <span id="ctl00_CPHMenu_lblUserName" class="labelWithBoldColor"></span>                    
                        </div>
                        <div class="left-container50" style="text-align:center;"> <br />
                            <span id="ctl00_CPHMenu_LblInsuranceCompany" class="label" style="color:Black;font-family:Tahoma;font-size:24px;">IFFCO-TOKIO GENERAL INSURANCE CO. LTD.</span>
                        </div>
                        <div class="left-container50" style="text-align:center;"> <br />
                            <span id="ctl00_CPHMenu_LblInsuranceProduct" class="label" style="color:Black;font-family:Times New Roman;font-size:15px;">PRAVASI BHARTIYA BIMA YOJANA 2017</span>
                        </div>
                    </div>
                
            </div>
            <!--Body Content-->
            <div style="width: 100%; height:600px;text-align: center;">
                <div style="width: 5px; float: left">
                    &nbsp;
                </div>
                <div style="width: 925px; text-align: left; float: left">
                    
    <body>
     <script type="text/javascript">
         function pageLoad() {
             var sPolicyMsg = $('#ctl00_CPHBody_hdnPolicyNo').val();
             if (sPolicyMsg != '') {
                 if (sPolicyMsg.length == 8) {
                     if (sPolicyMsg <= "32092124")
                         ShowPolicy(sPolicyMsg);
                     else
                         getRpt('', sPolicyMsg);
                 }
                 else {
                     alert(sPolicyMsg);
                     //ShowPolicy(sPolicyMsg);
                 }
                 $('#ctl00_CPHBody_hdnPolicyNo').val('');
             }
             else 
                 setFocusOnFirstTB();
         }
         function onPrintClick() {
             document.getElementById('ctl00_CPHBody_divgvdata').style.display = "none";
            var sPolicyType = $('#ctl00_CPHBody_ddlSelectPolicy').val();
            if (sPolicyType == "" || sPolicyType == "-1" || sPolicyType == "-2") {
                alert('Select Policy type.');
                return false;
            }
            if ($('#ctl00_CPHBody_txtPolicyno').val()=='') {
                alert('Enter Valid No.');
                return false;
            }
            return true;
        }
        function validateReIssue() {
            if (trim($('#ctl00_CPHBody_txtnominee').val()) == '' || trim($('#ctl00_CPHBody_txtnommrelation').val()) == '') {
                alert('Enter Nominee Name / Relation');
                return false;
            }
            if ($('#ctl00_CPHBody_ddlduration').val() == '') {
                alert('Select Policy Duration');
                return false;
            }
            return true;
        }
        function removeSpecialChars_Name(ctrl) {
            ctrl.value = ctrl.value.replace(/[^a-z0-9.\s]/gi, '');
        }
        function ShowPolicy(sPolicyNo) {
            var sProlicyURL = 'Policy.aspx?q=s&' + 'poserial=' + sPolicyNo;
            var myWindow = window.open(sProlicyURL, "_New", "width=" + screen.width + ", height=" + screen.height + ", top=0, left=0, resizable=yes,menubar=no,titlebar=no,toolbar=no,location=no,directories=no,status=no,scrollbars=yes");
            myWindow.focus();
            return false;
        }
        function getRpt(sCallBy, sPolicyNo) {
            if (sPolicyNo=='')
                sPolicyNo = $('#ctl00_CPHBody_txtPolicyno').val();
            if (sPolicyNo == '') {
                alert('Enter Policy No.');
                return false;
            }
            PageMethods.set_path('../rpt/Policyno.aspx');
            //Call server side function
            PageMethods.getRptExportPDFXLS('EX', sPolicyNo, '', onComplete_getRpt, onError_getRpt, sCallBy);
            return false;
        }
        // Callback function on complete
        function onComplete_getRpt(result, txtresult, methodName) {
            if (result == 'Error Temp Directory is not created') {
                alert(result);
                return false;
            }
            if (result.split("#").length > 1) {
                var sRetVal = result.split("#");
                var files = "../Controls/Exportrptfile.ashx?file=" + sRetVal[1];
                var sEXP = "";

                if (txtresult == "T") {
                    myWindow = window.open(sRetVal[1], "_New", "width=" + screen.width + ", height=" + screen.height + ", top=0, left=0, resizable=no,menubar=no,titlebar=no,toolbar=no,location=no,directories=no,status=no");
                }
                else {
                    sEXP = '<iframe style="height:1px; width: 1px; display: block;" id="frmexp" src="' + files + '" ></iframe>';
                }
                //create span to contain the text
                ctlspPDFEXL(sEXP);
            }
            else {
                alert(result);
            }
        }
        // Callback function on error
        function onError_getRpt(error, userContext, methodName) {
            if (error !== null) {
                alert(error.get_message());
            }
        }
     </script>

    <div class="pagebody">
        <div class="table-rowC">
             <div class="Headerfont4">
                <span id="ctl00_CPHBody_lblDSR">Enter Passport No to Query :</span>
            </div>
        </div>
        <div class="table-rowC"></div>
        <div class="table-rowC"></div>
        <div class="table-rowC">
            <div class="left-container01"></div>
            <div class="left-container35" style="display:none;">
                <select name="ctl00$CPHBody$ddlSelectPolicy" onchange="javascript:setTimeout(&#39;__doPostBack(\&#39;ctl00$CPHBody$ddlSelectPolicy\&#39;,\&#39;\&#39;)&#39;, 0)" id="ctl00_CPHBody_ddlSelectPolicy">
	<option value="-1">--------------- Select a policy ---------------</option>
	<option value="-2">IFFCO TOKIO General Insurance Co. Ltd</option>
	<option value="2">----- OVERSEAS POLICY FOR PRAVASI BHARATIYA</option>
	<option selected="selected" value="1">----- PRAVASI BHARTIYA BIMA YOJANA 2017</option>

</select>
            </div>
            <div class="left-container01">
                <input name="ctl00$CPHBody$hdnPolicyNo" type="hidden" id="ctl00_CPHBody_hdnPolicyNo" value="No Polices found!" />
            </div>
            <div class="left-container09">
                <input name="ctl00$CPHBody$txtPolicyno" type="text" value="W7474367" maxlength="8" id="ctl00_CPHBody_txtPolicyno" class="TextBoxStyleCal" />
            </div>
            <div class="left-container05"></div>
            <div class="left-container12">
                <input type="submit" name="ctl00$CPHBody$btnPrintPolicy" value="Query Passport" onclick="return onPrintClick();" id="ctl00_CPHBody_btnPrintPolicy" class="buttonB" />
            </div> 
            <div class="left-container05"></div>
            <div class="left-container12">
                <input type="submit" name="ctl00$CPHBody$btnPDFPolicy" value="Export PDF" onclick="return getRpt(&#39;&#39;,&#39;&#39;);" id="ctl00_CPHBody_btnPDFPolicy" class="buttonB" style="display:none;" />
            </div> 
            <div class="left-container10">
                <input type="submit" name="ctl00$CPHBody$btnExit" value="Exit" id="ctl00_CPHBody_btnExit" class="buttonM" />
            </div> 
        </div>
        <div class="table-rowC"></div>
        <div class="table-rowC"></div>
        <div id="ctl00_CPHBody_divgvdata" style="display:none;">
           <div class="table-rowC">
                <div class="left-container35"></div>
                <div class="left-container35">
                    <span id="ctl00_CPHBody_Span1">Multiple Policy found for above Passport No.</span>
                 </div>
            </div>
           <div style="border: solid 1px #666666;">
                  <div>

</div>   
            </div> 
        </div>
        <div class="table-rowC"></div>
        
    </div>
</body>

                </div>
            </div>
            <!--Footer-->
              
        </div>
        <div style="width: 29px;float:right;">&nbsp;</div>
         
    </div>
    </form>
</body>
</html>
