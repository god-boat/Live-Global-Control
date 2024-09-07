
//live api via js
autowatch = 1;

inlets = 4; // value, parameter, device, track
outlets = 2; // value, name

var apiobject;
var currentparameter = 0;
var currentdevice = 0;
var currenttrack = 0;
var currentname;
var currentid = 0;
var currentvalue = 0.;
var currentvaluemin = 0.;
var currentcurrentvaluemax = 1.;


function bang()
{
	if ( inlet == 0 )
	{
		initialize()
	}
	return;
}

function initialize()
{
	apiobject = new LiveAPI( update, "live_set tracks " + currenttrack + " devices " + currentdevice + " parameters " + currentparameter );
	setcurrentid( apiobject.id );
	outlet( 1, "id " + currentid );
	return;
}

function update()
{
	return;
}

function msg_float( f )
{
	if ( inlet == 0 )
	{
		setcurrentvalue( clipfloat( f ) );
	}
	else
		msg_int( f );
	return;
}

function msg_int( i )
{
	switch ( inlet )
	{
		case 0:
			setcurrentvalue( clipfloat( i ) );
			break;
		case 1:
			setcurrentparameter( i );
			break;
		case 2:
			setcurrentdevice( i );
			break;
		case 3:
			setcurrenttrack( i );
			break;
		default:
			break;
	}
	return;
}

function clipfloat( f )
{
	if ( f > currentvaluemax )
	{
		f = currentvaluemax;
	}
	if ( f < currentvaluemin )
	{
		f = currentvaluemin;
	}
	return f;
}

function setcurrentid( i )
{
	currentid = i;
}

function setcurrenttrack( n )
{
	apiobject.path = "live_set";
	tracks = apiobject.getcount( "tracks" );
	if ( n < 0 )
	{
		currenttrack = 0;
	}
	else if (n >= tracks )
	{
		currenttrack = tracks - 1;
	}
	else
	{
		currenttrack = n;
	}
		apiobject.path = "live_set tracks " + currenttrack ;
		outlet( 1, apiobject.get( "name" ) );
		apiobject.path = "live_set tracks " + currenttrack + " devices " + currentdevice + " parameters " + currentparameter ;
}

function setcurrentdevice( n )
{
	apiobject.path = "live_set tracks " + currenttrack;
	devices = apiobject.getcount( "devices" );
	if ( n < 0 )
	{
		currentdevice = 0;
	}
	else if (n >= devices )
	{
		currentdevice = devices - 1;
	}
	else
	{
		currentdevice = n;
	}
	apiobject.path = "live_set tracks " + currenttrack + " devices " + currentdevice ;
	outlet( 1, apiobject.get( "name" ) );
	apiobject.path = "live_set tracks " + currenttrack + " devices " + currentdevice + " parameters " + currentparameter ;
}

function setcurrentparameter( n )
{
	apiobject.path = "live_set tracks " + currenttrack + " devices " + currentdevice;
	parameters = apiobject.getcount( "parameters" );
	if ( n < 0 )
	{
		currentparameter = 0;
	}
	else if (n >= parameters )
	{
		currentparameter = parameters - 1;
	}
	else
	{
		currentparameter = n;
	}
	apiobject.path = "live_set tracks " + currenttrack + " devices " + currentdevice + " parameters " + currentparameter ;
	currentvaluemin = apiobject.get( "min" );
	currentvaluemax = apiobject.get( "max" );
	currentvalue = clipfloat( currentvalue );
	outlet( 1, apiobject.get( "name" ) );
}

function setcurrentvalue( f )
{
	currentvalue = f;
	apiobject.set( "value", currentvalue );
	outlet( 0, currentvalue );
}
